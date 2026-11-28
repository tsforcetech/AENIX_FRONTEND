import { useState } from 'react';
import type { Vendor, VendorCategory } from '@/domain/types';
import { usePaymentTermOptions } from '@/features/sales-orders/master-fields';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { useToast } from '@/shared/ui/Toast';
import { useUpdateVendor, useVendorCategoryOptions } from './api';

const STATUSES: Vendor['status'][] = ['Active', 'On hold', 'Inactive'];

type Form = {
  name: string;
  categoryId: string;
  contactName: string;
  contactEmail: string;
  paymentTermsDays: string;
  status: Vendor['status'];
};

/** MASTERS M2: edit a vendor's profile, category, terms and status (changes are logged old → new). */
export function EditVendorDialog({ vendor: v0, onClose }: { vendor: Vendor; onClose: () => void }) {
  const categories = useVendorCategoryOptions();
  const terms = usePaymentTermOptions(v0.paymentTermsDays);
  const update = useUpdateVendor();
  const toast = useToast();
  const cats = categories.data ?? [];
  const [v, setV] = useState<Form>({
    name: v0.name,
    categoryId: '',
    contactName: v0.contactName,
    contactEmail: v0.contactEmail,
    paymentTermsDays: String(v0.paymentTermsDays),
    status: v0.status,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'form', string>>>({});
  const set = (k: keyof Form, val: string) => setV((p) => ({ ...p, [k]: val }));
  // Until a category is picked, show the first master entry that behaves like the stored category.
  const categoryId = v.categoryId || cats.find((c) => c.behaves === v0.category)?.value || '';
  const categoryOptions = cats.map(({ value, label }) => ({ value, label }));

  const submit = () => {
    const days = Number(v.paymentTermsDays);
    const e: typeof errors = {};
    if (v.name.trim().length < 2) e.name = 'Enter the legal name';
    if (!categoryId) e.categoryId = 'Choose a category';
    if (v.contactName.trim().length < 2) e.contactName = 'Enter a contact name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contactEmail.trim())) e.contactEmail = 'Enter a valid email';
    if (!Number.isInteger(days) || days < 0) e.paymentTermsDays = 'Choose payment terms';
    setErrors(e);
    if (Object.keys(e).length) return;
    const category: VendorCategory = cats.find((c) => c.value === categoryId)?.behaves ?? v0.category;
    update.mutate(
      {
        id: v0.id,
        input: {
          name: v.name,
          category,
          contactName: v.contactName,
          contactEmail: v.contactEmail,
          paymentTermsDays: days,
          status: v.status,
        },
      },
      {
        onSuccess: (n) => {
          toast({ title: `${n.name} updated`, body: 'The change is in the audit log.' });
          onClose();
        },
        onError: (err) => setErrors({ form: err.message }),
      },
    );
  };
  useFormShortcuts({ onSave: submit, onPrimary: submit });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Edit vendor — ${v0.code}`}
      description="The category decides how the vendor works in purchase orders, warehouse sites and transport. Every change is logged."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={update.isPending} onClick={submit}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Legal name"
          required
          className="sm:col-span-2"
          value={v.name}
          error={errors.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <SelectField
          label="Category"
          required
          placeholder="Select category"
          options={categoryOptions}
          value={categoryId}
          error={errors.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
        />
        <SelectField
          label="Payment terms"
          required
          options={terms.options}
          value={v.paymentTermsDays}
          error={errors.paymentTermsDays}
          onChange={(e) => set('paymentTermsDays', e.target.value)}
        />
        <TextField
          label="Contact name"
          required
          value={v.contactName}
          error={errors.contactName}
          onChange={(e) => set('contactName', e.target.value)}
        />
        <TextField
          label="Email"
          type="email"
          required
          value={v.contactEmail}
          error={errors.contactEmail}
          onChange={(e) => set('contactEmail', e.target.value)}
        />
        <SelectField
          label="Status"
          required
          options={STATUSES.map((s) => ({ value: s, label: s }))}
          value={v.status}
          onChange={(e) => set('status', e.target.value)}
        />
        {errors.form ? (
          <p role="alert" className="text-caption font-medium text-danger sm:col-span-2">
            {errors.form}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
