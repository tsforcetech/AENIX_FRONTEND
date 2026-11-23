import { useState } from 'react';
import { useServiceOptions, useVendorOptions } from '@/shared/data/lookups';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Toast';
import { formatMoney } from '@/shared/utils/format';
import { suggestedCost, useAssignVendor, type WorkOrderDetail } from './api';

export function AssignVendorDialog({
  open,
  onClose,
  wo,
}: {
  open: boolean;
  onClose: () => void;
  wo: WorkOrderDetail;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign vendor"
      description={`${wo.number} · ${wo.origin} → ${wo.destination}`}
    >
      {open ? <AssignVendorForm wo={wo} onDone={onClose} /> : null}
    </Dialog>
  );
}

function AssignVendorForm({ wo, onDone }: { wo: WorkOrderDetail; onDone: () => void }) {
  const services = useServiceOptions();
  const vendors = useVendorOptions();
  const assign = useAssignVendor();
  const toast = useToast();
  const jobServiceIds = new Set(wo.lines.map((l) => l.serviceId));
  const serviceOptions = (services.data ?? [])
    .filter((s) => jobServiceIds.has(s.value))
    .concat((services.data ?? []).filter((s) => !jobServiceIds.has(s.value)));
  const [serviceId, setServiceId] = useState(wo.lines[0]?.serviceId ?? '');
  const [vendorId, setVendorId] = useState('');
  const [cost, setCost] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suggestion = vendorId && serviceId ? suggestedCost(wo, vendorId, serviceId) : undefined;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!serviceId) e.serviceId = 'Choose a service';
    if (!vendorId) e.vendorId = 'Choose a vendor';
    const amount = Number(cost || suggestion);
    if (!Number.isFinite(amount) || amount <= 0) e.cost = 'Enter the agreed cost';
    setErrors(e);
    if (Object.keys(e).length) return;
    assign.mutate(
      { id: wo.id, vendorId, serviceId, agreedCost: amount },
      {
        onSuccess: () => {
          toast({ title: 'Vendor assigned', body: 'The vendor has been requested for this service.' });
          onDone();
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <SelectField
        label="Service"
        required
        placeholder="Select service"
        options={serviceOptions.map((s) => ({
          value: s.value,
          label: jobServiceIds.has(s.value) ? `${s.label} (on this job)` : s.label,
        }))}
        value={serviceId}
        error={errors.serviceId}
        onChange={(e) => setServiceId(e.target.value)}
      />
      <SelectField
        label="Vendor"
        required
        placeholder={vendors.isLoading ? 'Loading…' : 'Select vendor'}
        options={vendors.data ?? []}
        value={vendorId}
        error={errors.vendorId}
        onChange={(e) => setVendorId(e.target.value)}
      />
      <TextField
        label="Agreed cost (AED)"
        type="number"
        inputMode="decimal"
        step="0.01"
        required
        value={cost}
        placeholder={suggestion !== undefined ? String(suggestion) : 'e.g. 650'}
        error={errors.cost}
        onChange={(e) => setCost(e.target.value)}
        hint={
          suggestion !== undefined
            ? `Rate card suggests ${formatMoney(suggestion)} — leave empty to use it.`
            : vendorId && serviceId
              ? 'No rate card for this vendor and service. Enter the negotiated cost.'
              : undefined
        }
      />
      <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button busy={assign.isPending} onClick={submit}>
          Assign vendor
        </Button>
      </div>
    </div>
  );
}
