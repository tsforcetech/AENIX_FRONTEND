import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assertOpenPeriod } from '@/domain/controls';
import { nextDocNumber } from '@/domain/numbering';
import type {
  Driver,
  InternalCost,
  JournalEntry,
  Trip,
  TripExpenseType,
  Vehicle,
  WorkOrder,
} from '@/domain/types';
import {
  expiryAlerts,
  expiryAlertText,
  expiryLevel,
  tripCostTotals,
  type ExpiryAlert,
} from '@/domain/workflow';
import { postJournal } from '@/features/accounting/ledger';
import { advanceIfCurrent } from '@/features/work-orders/api';
import { lookupName } from '@/shared/data/lookups';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';

/**
 * Own fleet (FLOW-003 T6/T7). PROTOTYPE ADAPTER — optional module (`company.modules.ownFleet`).
 * Account codes are illustrative and pending accountant sign-off; the backend owns posting.
 */
export const TRIP_EXPENSE_TYPES: TripExpenseType[] = [
  'Fuel',
  'Salik / tolls',
  'Driver allowance',
  'Parking',
  'Maintenance',
  'Other',
];
export const VEHICLE_TYPES: Vehicle['type'][] = [
  '3-ton truck',
  '7-ton truck',
  '10-ton truck',
  'Trailer (40ft)',
  'Pickup',
  'Forklift',
];
export const TRIP_ACCOUNTS = {
  cost: '5200 Direct job costs — own fleet',
  bank: '1110 Bank — current account',
  pettyCash: '1120 Petty cash',
} as const;

export type PaidFrom = 'Bank' | 'Petty cash';

export interface VehicleRow extends Vehicle {
  alerts: ExpiryAlert[];
  currentTrip?: string;
}
export interface DriverRow extends Driver {
  alerts: ExpiryAlert[];
  currentTrip?: string;
}
export interface TripRow extends Trip {
  jobNumber: string;
  customerName: string;
  vehiclePlate: string;
  driverName: string;
  total: number;
  distanceKm?: number;
}
export interface TripDetail extends TripRow {
  journal?: Pick<JournalEntry, 'id' | 'number' | 'date' | 'lines'>;
  vehicle?: VehicleRow;
  driver?: DriverRow;
}
export interface FleetOverview {
  enabled: boolean;
  today: string;
  vehicles: VehicleRow[];
  drivers: DriverRow[];
  trips: TripRow[];
}

/** Vehicle or driver choice for a trip, with the reason it cannot be used (if any). */
export interface FleetOption {
  value: string;
  label: string;
  blockedReason?: string;
  warning?: string;
}

function enabled() {
  return protoDb.get().company.modules?.ownFleet ?? false;
}

function openTripOf(field: 'vehicleId' | 'driverId', id: string, exceptTripId?: string) {
  return protoDb.get().trips.find((t) => t[field] === id && t.status === 'Started' && t.id !== exceptTripId);
}

function vehicleRow(v: Vehicle): VehicleRow {
  return {
    ...v,
    alerts: expiryAlerts(v, PROTO_TODAY),
    currentTrip: openTripOf('vehicleId', v.id)?.number,
  };
}

function driverRow(d: Driver): DriverRow {
  return { ...d, alerts: expiryAlerts(d, PROTO_TODAY), currentTrip: openTripOf('driverId', d.id)?.number };
}

function tripRow(t: Trip): TripRow {
  const db = protoDb.get();
  const wo = db.workOrders.find((w) => w.id === t.workOrderId);
  return {
    ...t,
    jobNumber: wo?.number ?? '—',
    customerName: wo ? lookupName.customer(wo.customerId) : '—',
    vehiclePlate: db.vehicles.find((v) => v.id === t.vehicleId)?.plate ?? '—',
    driverName: db.drivers.find((d) => d.id === t.driverId)?.name ?? '—',
    total: tripCostTotals(t.expenses).total,
    distanceKm: t.startKm !== undefined && t.endKm !== undefined ? t.endKm - t.startKm : undefined,
  };
}

/** Why a vehicle cannot be used on `date` (expired documents, maintenance, inactive). */
export function vehicleBlock(v: Vehicle, date: string): string | undefined {
  if (v.status === 'Inactive') return 'Vehicle is inactive';
  if (v.status === 'Maintenance') return 'Vehicle is in maintenance';
  if (expiryLevel(v.registrationExpiry, date).level === 'Expired')
    return `Registration expired on ${v.registrationExpiry}`;
  if (expiryLevel(v.insuranceExpiry, date).level === 'Expired')
    return `Insurance expired on ${v.insuranceExpiry}`;
  return undefined;
}

export function driverBlock(d: Driver, date: string): string | undefined {
  if (expiryLevel(d.licenceExpiry, date).level === 'Expired') return `Licence expired on ${d.licenceExpiry}`;
  return undefined;
}

function findTrip(id: string): Trip {
  const t = protoDb.get().trips.find((x) => x.id === id);
  if (!t) throw new Error('Trip not found');
  return t;
}

function patchTrip(id: string, fn: (t: Trip) => Trip) {
  protoDb.update((s) => ({ ...s, trips: s.trips.map((t) => (t.id === id ? fn(t) : t)) }));
}

function setStatuses(vehicleId: string, driverId: string, status: 'On trip' | 'Available') {
  protoDb.update((s) => ({
    ...s,
    vehicles: s.vehicles.map((v) =>
      v.id === vehicleId && (status === 'On trip' || v.status === 'On trip') ? { ...v, status } : v,
    ),
    drivers: s.drivers.map((d) =>
      d.id === driverId && (status === 'On trip' || d.status === 'On trip') ? { ...d, status } : d,
    ),
  }));
}

function fail<T>(message: string): Promise<T> {
  return Promise.reject(new Error(message));
}

export type VehicleInput = Omit<Vehicle, 'id'> & { id?: string };
export type DriverInput = Omit<Driver, 'id'> & { id?: string };

export const fleetApi = {
  overview(): Promise<FleetOverview> {
    const db = protoDb.get();
    return latency({
      enabled: enabled(),
      today: PROTO_TODAY,
      vehicles: db.vehicles.map(vehicleRow),
      drivers: db.drivers.map(driverRow),
      trips: [...db.trips]
        .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
        .map(tripRow),
    });
  },

  trip(id: string): Promise<TripDetail> {
    const db = protoDb.get();
    const t = db.trips.find((x) => x.id === id);
    if (!t) return fail('Trip not found');
    const journal = db.journals.find((j) => j.source === 'Trip' && j.reference === t.number);
    const v = db.vehicles.find((x) => x.id === t.vehicleId);
    const d = db.drivers.find((x) => x.id === t.driverId);
    return latency({
      ...tripRow(t),
      journal: journal
        ? { id: journal.id, number: journal.number, date: journal.date, lines: journal.lines }
        : undefined,
      vehicle: v ? vehicleRow(v) : undefined,
      driver: d ? driverRow(d) : undefined,
    });
  },

  /** Choices for "Assign own vehicle", with block reasons for the trip date. */
  options(date: string): Promise<{ enabled: boolean; vehicles: FleetOption[]; drivers: FleetOption[] }> {
    const db = protoDb.get();
    return latency(
      {
        enabled: enabled(),
        vehicles: db.vehicles.map((v) => {
          const alert = expiryAlerts(v, date).find((a) => a.level === 'Expiring');
          return {
            value: v.id,
            label: `${v.plate} · ${v.type} · ${v.status}`,
            blockedReason: vehicleBlock(v, date),
            warning: alert ? expiryAlertText(alert) : undefined,
          };
        }),
        drivers: db.drivers.map((d) => {
          const alert = expiryAlerts(d, date).find((a) => a.level === 'Expiring');
          return {
            value: d.id,
            label: `${d.name} · ${d.status}`,
            blockedReason: driverBlock(d, date),
            warning: alert ? expiryAlertText(alert) : undefined,
          };
        }),
      },
      60,
    );
  },

  saveVehicle(input: VehicleInput): Promise<Vehicle> {
    const plate = input.plate.trim().toUpperCase();
    if (!plate) return fail('Enter the plate number');
    const db = protoDb.get();
    if (db.vehicles.some((v) => v.plate === plate && v.id !== input.id))
      return fail(`A vehicle with plate ${plate} already exists`);
    const before = input.id ? db.vehicles.find((v) => v.id === input.id) : undefined;
    const v: Vehicle = { ...input, plate, id: input.id ?? newId('veh') };
    protoDb.update((s) => ({
      ...s,
      vehicles: before ? s.vehicles.map((x) => (x.id === v.id ? v : x)) : [...s.vehicles, v],
    }));
    logActivity({
      entity: 'Fleet',
      entityId: v.id,
      entityRef: v.plate,
      action: before ? 'updated the vehicle' : 'added a vehicle',
      changes: before
        ? (['status', 'registrationExpiry', 'insuranceExpiry'] as const)
            .filter((f) => before[f] !== v[f])
            .map((f) => ({ field: f, from: String(before[f]), to: String(v[f]) }))
        : undefined,
    });
    return latency(v);
  },

  saveDriver(input: DriverInput): Promise<Driver> {
    const name = input.name.trim();
    if (!name) return fail('Enter the driver name');
    if (!input.licenceNo.trim()) return fail('Enter the licence number');
    const db = protoDb.get();
    const before = input.id ? db.drivers.find((d) => d.id === input.id) : undefined;
    const d: Driver = { ...input, name, id: input.id ?? newId('drv') };
    protoDb.update((s) => ({
      ...s,
      drivers: before ? s.drivers.map((x) => (x.id === d.id ? d : x)) : [...s.drivers, d],
    }));
    logActivity({
      entity: 'Fleet',
      entityId: d.id,
      entityRef: d.name,
      action: before ? 'updated the driver' : 'added a driver',
    });
    return latency(d);
  },

  /** T7: own vehicle instead of a vendor PO — creates a planned trip on the job. */
  assignOwnVehicle(
    workOrderId: string,
    input: { vehicleId: string; driverId: string; date: string },
  ): Promise<Trip> {
    if (!enabled()) return fail('The own fleet module is off — enable it in Settings.');
    const db = protoDb.get();
    const wo = db.workOrders.find((w) => w.id === workOrderId);
    if (!wo) return fail('Job not found');
    if (!wo.serviceCategories.includes('Transport'))
      return fail('Own vehicles can be assigned to transport jobs only');
    if (['Cancelled', 'Completed', 'Draft'].includes(wo.status))
      return fail('Confirm the job first — vehicles are assigned to running jobs only');
    const v = db.vehicles.find((x) => x.id === input.vehicleId);
    const d = db.drivers.find((x) => x.id === input.driverId);
    if (!v) return fail('Choose a vehicle');
    if (!d) return fail('Choose a driver');
    if (!input.date) return fail('Choose the trip date');
    const block = vehicleBlock(v, input.date) ?? driverBlock(d, input.date);
    if (block)
      return fail(
        `${block} — this ${vehicleBlock(v, input.date) ? 'vehicle' : 'driver'} cannot be assigned.`,
      );
    const trip: Trip = {
      id: newId('trp'),
      number: nextDocNumber(
        db.trips.map((t) => t.number),
        'TRP-',
        3,
      ),
      workOrderId,
      vehicleId: v.id,
      driverId: d.id,
      date: input.date,
      expenses: [],
      status: 'Planned',
    };
    protoDb.update((s) => ({
      ...s,
      trips: [trip, ...s.trips],
      workOrders: s.workOrders.map((w) =>
        w.id === workOrderId ? advanceIfCurrent(w, 'Vehicle assigned') : w,
      ),
    }));
    logActivity({
      entity: 'Trip',
      entityId: trip.id,
      entityRef: trip.number,
      action: `assigned ${v.plate} with ${d.name} to ${wo.number}`,
    });
    return latency(trip);
  },

  startTrip(id: string, startKm: number): Promise<Trip> {
    const t = findTrip(id);
    if (t.status !== 'Planned') return fail('Only planned trips can be started');
    if (!(startKm >= 0)) return fail('Enter the start km reading');
    const db = protoDb.get();
    const v = db.vehicles.find((x) => x.id === t.vehicleId)!;
    const d = db.drivers.find((x) => x.id === t.driverId)!;
    const block = vehicleBlock(v, PROTO_TODAY) ?? driverBlock(d, PROTO_TODAY);
    if (block) return fail(`${block} — the trip cannot start.`);
    const busyV = openTripOf('vehicleId', v.id, id);
    if (busyV) return fail(`${v.plate} is already on trip ${busyV.number}`);
    const busyD = openTripOf('driverId', d.id, id);
    if (busyD) return fail(`${d.name} is already on trip ${busyD.number}`);
    patchTrip(id, (x) => ({ ...x, status: 'Started', startKm }));
    setStatuses(v.id, d.id, 'On trip');
    logActivity({
      entity: 'Trip',
      entityId: id,
      entityRef: t.number,
      action: `started the trip at ${startKm} km`,
    });
    return latency(findTrip(id));
  },

  addExpense(id: string, e: { type: TripExpenseType; amount: number; reference?: string }): Promise<Trip> {
    const t = findTrip(id);
    if (t.status === 'Completed' || t.status === 'Cancelled')
      return fail('Expenses can be added only before the trip is completed');
    if (!(e.amount > 0)) return fail('Enter an amount above zero');
    patchTrip(id, (x) => ({
      ...x,
      expenses: [
        ...x.expenses,
        { id: newId('tx'), type: e.type, amount: e.amount, reference: e.reference?.trim() || undefined },
      ],
    }));
    logActivity({
      entity: 'Trip',
      entityId: id,
      entityRef: t.number,
      action: `added ${e.type} expense ${e.amount}`,
    });
    return latency(findTrip(id));
  },

  removeExpense(id: string, expenseId: string): Promise<Trip> {
    const t = findTrip(id);
    if (t.status === 'Completed' || t.status === 'Cancelled') return fail('The trip is closed');
    patchTrip(id, (x) => ({ ...x, expenses: x.expenses.filter((e) => e.id !== expenseId) }));
    return latency(findTrip(id));
  },

  /**
   * Complete the trip: end km, expenses charged to the job as internal costs and a journal
   * (Dr 5200 own-fleet job costs, Cr bank / petty cash) after the period-lock check.
   */
  completeTrip(id: string, input: { endKm: number; paidFrom: PaidFrom }): Promise<Trip> {
    const t = findTrip(id);
    if (t.status !== 'Started') return fail('Start the trip before completing it');
    if (!(input.endKm >= (t.startKm ?? 0)))
      return fail(`End km must be at least the start km (${t.startKm ?? 0})`);
    const db = protoDb.get();
    try {
      assertOpenPeriod(db.company, t.date);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    const totals = tripCostTotals(t.expenses);
    const costs: InternalCost[] = Object.entries(totals.byType).map(([type, amount]) => ({
      id: newId('ic'),
      date: t.date,
      kind: 'Own vehicle (trip)',
      description: `${t.number} — ${type}`,
      quantity: 1,
      unit: 'Trip',
      rate: amount,
      tripId: t.id,
    }));
    if (totals.total > 0) {
      postJournal({
        date: t.date,
        source: 'Trip',
        reference: t.number,
        memo: `Own fleet trip ${t.number} — ${db.workOrders.find((w) => w.id === t.workOrderId)?.number ?? ''}`,
        lines: [
          { account: TRIP_ACCOUNTS.cost, debit: totals.total, credit: 0 },
          {
            account: input.paidFrom === 'Bank' ? TRIP_ACCOUNTS.bank : TRIP_ACCOUNTS.pettyCash,
            debit: 0,
            credit: totals.total,
          },
        ],
      });
    }
    protoDb.update((s) => ({
      ...s,
      trips: s.trips.map((x) =>
        x.id === id ? { ...x, status: 'Completed' as const, endKm: input.endKm } : x,
      ),
      vehicles: s.vehicles.map((v) =>
        v.id === t.vehicleId ? { ...v, odometerKm: Math.max(v.odometerKm, input.endKm) } : v,
      ),
      workOrders: s.workOrders.map((w): WorkOrder =>
        w.id === t.workOrderId ? { ...w, internalCosts: [...(w.internalCosts ?? []), ...costs] } : w,
      ),
    }));
    setStatuses(t.vehicleId, t.driverId, 'Available');
    logActivity({
      entity: 'Trip',
      entityId: id,
      entityRef: t.number,
      action: `completed the trip (${input.endKm - (t.startKm ?? 0)} km, costs ${totals.total} charged to the job)`,
    });
    return latency(findTrip(id));
  },

  cancelTrip(id: string): Promise<Trip> {
    const t = findTrip(id);
    if (t.status === 'Completed' || t.status === 'Cancelled') return fail('The trip is already closed');
    patchTrip(id, (x) => ({ ...x, status: 'Cancelled' }));
    setStatuses(t.vehicleId, t.driverId, 'Available');
    logActivity({ entity: 'Trip', entityId: id, entityRef: t.number, action: 'cancelled the trip' });
    return latency(findTrip(id));
  },
};

// ---------- hooks ----------
export function useFleet() {
  return useQuery({ queryKey: ['fleet', 'overview'], queryFn: fleetApi.overview });
}

export function useTrip(id: string) {
  return useQuery({ queryKey: ['fleet', 'trip', id], queryFn: () => fleetApi.trip(id) });
}

export function useFleetOptions(date: string, enabledQuery = true) {
  return useQuery({
    queryKey: ['fleet', 'options', date],
    queryFn: () => fleetApi.options(date),
    enabled: enabledQuery && !!date,
  });
}

function useInvalidateFleet() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['fleet'] });
    void qc.invalidateQueries({ queryKey: ['work-orders'] });
    void qc.invalidateQueries({ queryKey: ['accounting'] });
    void qc.invalidateQueries({ queryKey: ['ledger'] });
  };
}

export function useSaveVehicle() {
  const invalidate = useInvalidateFleet();
  return useMutation({ mutationFn: fleetApi.saveVehicle, onSuccess: invalidate });
}

export function useSaveDriver() {
  const invalidate = useInvalidateFleet();
  return useMutation({ mutationFn: fleetApi.saveDriver, onSuccess: invalidate });
}

export function useAssignOwnVehicle() {
  const invalidate = useInvalidateFleet();
  return useMutation({
    mutationFn: ({
      workOrderId,
      ...input
    }: {
      workOrderId: string;
      vehicleId: string;
      driverId: string;
      date: string;
    }) => fleetApi.assignOwnVehicle(workOrderId, input),
    onSuccess: invalidate,
  });
}

export type TripAction =
  | { kind: 'start'; id: string; startKm: number }
  | { kind: 'expense'; id: string; type: TripExpenseType; amount: number; reference?: string }
  | { kind: 'removeExpense'; id: string; expenseId: string }
  | { kind: 'complete'; id: string; endKm: number; paidFrom: PaidFrom }
  | { kind: 'cancel'; id: string };

export function useTripAction() {
  const invalidate = useInvalidateFleet();
  return useMutation({
    mutationFn: (a: TripAction): Promise<Trip> => {
      switch (a.kind) {
        case 'start':
          return fleetApi.startTrip(a.id, a.startKm);
        case 'expense':
          return fleetApi.addExpense(a.id, a);
        case 'removeExpense':
          return fleetApi.removeExpense(a.id, a.expenseId);
        case 'complete':
          return fleetApi.completeTrip(a.id, a);
        case 'cancel':
          return fleetApi.cancelTrip(a.id);
      }
    },
    onSuccess: invalidate,
  });
}
