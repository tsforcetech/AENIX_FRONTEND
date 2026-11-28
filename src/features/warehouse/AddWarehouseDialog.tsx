import { useState } from 'react';
import { useVendorOptions } from '@/shared/data/lookups';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { useCreateWarehouse } from './sites';

/** Add an own warehouse or a site run by a warehouse vendor. */
export function AddWarehouseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add warehouse"
      description="Jobs with a warehouse vendor use that vendor's site; other jobs use the own warehouse."
    >
      {open ? <AddWarehouseForm onDone={onClose} /> : null}
    </Dialog>
  );
}

function AddWarehouseForm({ onDone }: { onDone: () => void }) {
  const create = useCreateWarehouse();
  const vendors = useVendorOptions();
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<'Own' | 'Vendor'>('Own');
  const [vendorId, setVendorId] = useState('');
  const [city, setCity] = useState('');
  const [capacity, setCapacity] = useState('200');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          { name, type, vendorId: vendorId || undefined, city, palletCapacity: Number(capacity) },
          {
            onSuccess: (w) => {
              toast({ title: `${w.name} added` });
              onDone();
            },
          },
        );
      }}
    >
      <TextField
        label="Warehouse name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. DIC WH-2"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Run by"
          options={[
            { value: 'Own', label: 'Aenix (own warehouse)' },
            { value: 'Vendor', label: 'A warehouse vendor' },
          ]}
          value={type}
          onChange={(e) => setType(e.target.value as 'Own' | 'Vendor')}
        />
        {type === 'Vendor' ? (
          <SelectField
            label="Warehouse vendor"
            required
            placeholder="Select vendor"
            options={vendors.data ?? []}
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          />
        ) : null}
        <TextField label="City / area" value={city} onChange={(e) => setCity(e.target.value)} />
        <TextField
          label="Pallet positions"
          type="number"
          required
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </div>
      {create.error ? (
        <StatusMessage
          kind="error"
          title="Not added"
          description={create.error instanceof Error ? create.error.message : undefined}
        />
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" busy={create.isPending}>
          Add warehouse
        </Button>
      </div>
    </form>
  );
}
