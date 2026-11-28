import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookValue, depreciationFor, disposalGainLoss, monthlyCharge, periodEnd } from '@/domain/fixedAssets';
import type { AssetCategory, DepreciationRun, FixedAsset } from '@/domain/types';
import { postJournal } from '@/features/accounting/ledger';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';

/**
 * Fixed asset register (owner decision 2026-11-28). PROTOTYPE ADAPTER — backend contract API-DEP-45
 * pending. Straight-line monthly depreciation; postings illustrative, pending accountant sign-off.
 */
export const ASSET_CATEGORIES: readonly AssetCategory[] = [
  'Vehicles',
  'Material handling equipment',
  'Racking and storage',
  'IT equipment',
  'Furniture and fittings',
];

/**
 * MASTERS M2: asset categories from the Asset categories master, with the default useful life
 * and residual value (% of cost) that pre-fill a new asset.
 */
export function useAssetCategoryOptions() {
  return useQuery({
    queryKey: ['masters', 'options', 'assetCategories', 'defaults'],
    queryFn: () =>
      latency(
        protoDb
          .get()
          .assetCategories.filter((c) => c.active)
          .map((c) => ({
            value: c.name,
            label: c.name,
            usefulLifeMonths: c.usefulLifeMonths,
            residualPct: c.residualPct,
          })),
        40,
      ),
    staleTime: 30_000,
  });
}

const ACC = {
  cost: '1510 Property and equipment — cost',
  accDep: '1590 Accumulated depreciation',
  depExp: '6700 Depreciation',
  disposal: '6800 Gain / loss on disposal of assets',
  bank: '1110 Bank — current account',
  ap: '2100 Accounts payable',
};

export interface AssetRow extends FixedAsset {
  bookValue: number;
  monthly: number;
  vehiclePlate?: string;
}

const toRow = (a: FixedAsset): AssetRow => ({
  ...a,
  bookValue: bookValue(a),
  monthly: monthlyCharge(a),
  vehiclePlate: a.vehicleId ? protoDb.get().vehicles.find((v) => v.id === a.vehicleId)?.plate : undefined,
});

export interface AssetRegister {
  rows: AssetRow[];
  totals: { cost: number; accumulated: number; bookValue: number; active: number };
  runs: DepreciationRun[];
  lastPosted?: string;
  vehicles: { value: string; label: string }[];
}

function register(): AssetRegister {
  const db = protoDb.get();
  const rows = db.fixedAssets.map(toRow);
  const active = rows.filter((r) => r.status === 'Active');
  const sum = (k: 'cost' | 'accumulatedDepreciation' | 'bookValue') =>
    Math.round(active.reduce((s, r) => s + r[k], 0) * 100) / 100;
  const posted = db.fixedAssets.map((a) => a.depreciatedTo).filter(Boolean) as string[];
  return {
    rows,
    totals: {
      cost: sum('cost'),
      accumulated: sum('accumulatedDepreciation'),
      bookValue: sum('bookValue'),
      active: active.length,
    },
    runs: db.depreciationRuns,
    lastPosted: posted.sort().at(-1),
    vehicles: db.vehicles.map((v) => ({ value: v.id, label: `${v.plate} · ${v.type}` })),
  };
}

/** Preview of the depreciation for a period (YYYY-MM). */
export function previewDepreciation(period: string) {
  const lines = protoDb
    .get()
    .fixedAssets.map((a) => ({ asset: a, amount: depreciationFor(a, period) }))
    .filter((l) => l.amount > 0);
  return { lines, total: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100 };
}

export interface NewAssetInput {
  name: string;
  category: AssetCategory;
  acquisitionDate: string;
  cost: number;
  residualValue: number;
  usefulLifeMonths: number;
  location: string;
  supplier?: string;
  vehicleId?: string;
  paidFrom: 'Bank' | 'Vendor credit';
}

export const fixedAssetsApi = {
  register: () => latency(register()),

  create(input: NewAssetInput): Promise<FixedAsset> {
    if (!input.name.trim()) return Promise.reject(new Error('Enter the asset name'));
    if (!input.category) return Promise.reject(new Error('Choose a category'));
    if (!(input.cost > 0)) return Promise.reject(new Error('Cost must be above 0'));
    if (input.residualValue < 0 || input.residualValue >= input.cost)
      return Promise.reject(new Error('Residual value must be 0 or more and below the cost'));
    if (!(input.usefulLifeMonths >= 1))
      return Promise.reject(new Error('Useful life must be at least 1 month'));
    const db = protoDb.get();
    const n = Math.max(0, ...db.fixedAssets.map((a) => Number(a.number.slice(3)) || 0)) + 1;
    const asset: FixedAsset = {
      id: newId('fa'),
      number: `FA-${String(n).padStart(3, '0')}`,
      name: input.name.trim(),
      category: input.category,
      acquisitionDate: input.acquisitionDate,
      cost: input.cost,
      residualValue: input.residualValue,
      usefulLifeMonths: input.usefulLifeMonths,
      method: 'Straight-line',
      location: input.location.trim(),
      supplier: input.supplier?.trim() || undefined,
      vehicleId: input.vehicleId || undefined,
      accumulatedDepreciation: 0,
      status: 'Active',
    };
    try {
      postJournal({
        date: input.acquisitionDate,
        source: 'Manual',
        reference: asset.number,
        memo: `Capitalise ${asset.name}`,
        lines: [
          { account: ACC.cost, debit: asset.cost, credit: 0 },
          { account: input.paidFrom === 'Bank' ? ACC.bank : ACC.ap, debit: 0, credit: asset.cost },
        ],
      });
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Not posted'));
    }
    protoDb.update((s) => ({ ...s, fixedAssets: [asset, ...s.fixedAssets] }));
    logActivity({
      entity: 'Ledger',
      entityId: asset.id,
      entityRef: asset.number,
      action: `asset added (${asset.name})`,
    });
    return latency(asset);
  },

  runDepreciation(period: string): Promise<DepreciationRun> {
    const { lines, total } = previewDepreciation(period);
    if (!lines.length) return Promise.reject(new Error(`Nothing to depreciate for ${period}`));
    const db = protoDb.get();
    let journalId: string;
    try {
      journalId = postJournal({
        date: periodEnd(period),
        source: 'Manual',
        reference: `DEP-${period}`,
        memo: `Depreciation ${period} (${lines.length} assets)`,
        lines: [
          { account: ACC.depExp, debit: total, credit: 0 },
          { account: ACC.accDep, debit: 0, credit: total },
        ],
      }).id;
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Not posted'));
    }
    const run: DepreciationRun = {
      id: newId('dep'),
      number: `DEP-${String(db.depreciationRuns.length + 1).padStart(3, '0')}`,
      period,
      postedAt: nowIso(),
      lines: lines.map((l) => ({ assetId: l.asset.id, amount: l.amount })),
      total,
      journalId,
    };
    const byId = new Map(lines.map((l) => [l.asset.id, l.amount]));
    protoDb.update((s) => ({
      ...s,
      depreciationRuns: [run, ...s.depreciationRuns],
      fixedAssets: s.fixedAssets.map((a) =>
        byId.has(a.id)
          ? {
              ...a,
              accumulatedDepreciation: Math.round((a.accumulatedDepreciation + byId.get(a.id)!) * 100) / 100,
              depreciatedTo: period,
            }
          : a,
      ),
    }));
    logActivity({
      entity: 'Ledger',
      entityId: run.id,
      entityRef: run.number,
      action: `depreciation posted for ${period}`,
    });
    return latency(run);
  },

  dispose(id: string, input: { date: string; proceeds: number; reason: string }): Promise<FixedAsset> {
    const a = protoDb.get().fixedAssets.find((x) => x.id === id);
    if (!a) return Promise.reject(new Error('Asset not found'));
    if (a.status !== 'Active') return Promise.reject(new Error('Asset already disposed'));
    if (!input.reason.trim()) return Promise.reject(new Error('Enter the reason'));
    if (input.proceeds < 0) return Promise.reject(new Error('Proceeds cannot be negative'));
    const gainLoss = disposalGainLoss(a, input.proceeds);
    let journalId: string;
    try {
      journalId = postJournal({
        date: input.date,
        source: 'Manual',
        reference: a.number,
        memo: `Disposal of ${a.name}: ${input.reason.trim()}`,
        lines: [
          { account: ACC.accDep, debit: a.accumulatedDepreciation, credit: 0 },
          { account: ACC.bank, debit: input.proceeds, credit: 0 },
          { account: ACC.disposal, debit: gainLoss < 0 ? -gainLoss : 0, credit: gainLoss > 0 ? gainLoss : 0 },
          { account: ACC.cost, debit: 0, credit: a.cost },
        ],
      }).id;
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Not posted'));
    }
    const next: FixedAsset = {
      ...a,
      status: 'Disposed',
      disposal: {
        date: input.date,
        proceeds: input.proceeds,
        gainLoss,
        reason: input.reason.trim(),
        journalId,
      },
    };
    protoDb.update((s) => ({ ...s, fixedAssets: s.fixedAssets.map((x) => (x.id === id ? next : x)) }));
    logActivity({
      entity: 'Ledger',
      entityId: a.id,
      entityRef: a.number,
      action: `asset disposed (${input.reason.trim()})`,
    });
    return latency(next);
  },
};

const KEY = ['fixed-assets'] as const;

export const useAssetRegister = () => useQuery({ queryKey: KEY, queryFn: fixedAssetsApi.register });

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };
}

export function useCreateAsset() {
  const done = useInvalidate();
  return useMutation({ mutationFn: fixedAssetsApi.create, onSuccess: done });
}

export function useRunDepreciation() {
  const done = useInvalidate();
  return useMutation({ mutationFn: fixedAssetsApi.runDepreciation, onSuccess: done });
}

export function useDisposeAsset() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; date: string; proceeds: number; reason: string }) =>
      fixedAssetsApi.dispose(v.id, v),
    onSuccess: done,
  });
}
