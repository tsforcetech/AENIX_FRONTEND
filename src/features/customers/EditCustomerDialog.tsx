import { useState } from 'react';
import { useMasterOptions } from '@/features/masters/lookups';
import { usePaymentTermOptions } from '@/features/sales-orders/master-fields';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextareaField, TextField } from '@/shared/ui/Field';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { useToast } from '@/shared/ui/Toast';
import { useUpdateCustomer, type CustomerEditInput, type CustomerRow } from './api';

type Form = Omit<CustomerEditInput, 'creditLimit' | 'paymentTermsDays'> & {
  creditLimit: string;
  paymentTermsDays: string;
};
type Errors = Partial<Record<keyof Form | 'form', string>>;

const STATUSES: CustomerRow['status'][] = ['Active', 'On hold', 'Inactive'];

/** MASTERS M2: edit a customer's profile, terms and status (changes are logged old → new). */
export function EditCustomerDialog({ customer: c, onClose }: { customer: CustomerRow; onClose: () => void }) {
  const categories = useMasterOptions('customerCategories');
  const terms = usePaymentTermOptions(c.paymentTermsDays);
  const update = useUpdateCustomer();
  const toast = useToast();
  const [v, setV] = useState<Form>({
    name: c.name,
    industry: c.industry,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone,
    postalAddress: c.postalAddress ?? '',
    trn: '',
    creditLimit: String(c.creditLimit),
    paymentTermsDays: String(c.paymentTermsDays),
    status: c.status,
    holdReason: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = (k: keyof Form, val: string) => setV((p) => ({ ...p, [k]: val }));
  const categoryOptions = [...(categories.data ?? [])];
  if (v.industry && !categoryOptions.some((o) => o.value === v.industry))
    categoryOptions.push({ value: v.industry, label: `${v.industry} (not in the master)` });
  const goingOnHold = v.status === 'On hold' && c.status !== 'On hold';

  const submit = () => {
    const credit = Number(v.creditLimit);
    const days = Number(v.paymentTermsDays);
    const e: Errors = {};
    if (v.name.trim().length < 2) e.name = 'Enter the legal name';
    if (!v.industry) e.industry = 'Choose a category';
    if (v.contactName.trim().length < 2) e.contactName = 'Enter a contact name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contactEmail.trim())) e.contactEmail = 'Enter a valid email';
    if (v.contactPhone.trim().length < 7) e.contactPhone = 'Enter a phone number';
    if (v.trn.trim() && !/^\d{15}$/.test(v.trn.trim())) e.trn = 'UAE TRN is 15 digits';
    if (!Number.isFinite(credit) || credit < 0) e.creditLimit = 'Cannot be negative';
    if (!Number.isInteger(days) || days < 0) e.paymentTermsDays = 'Choose payment terms';
    if (goingOnHold && (v.holdReason ?? '').trim().length < 3)
      e.holdReason = 'Give the reason for the hold (at least 3 characters)';
    setErrors(e);
    if (Object.keys(e).length) return;
    update.mutate(
      { id: c.id, input: { ...v, creditLimit: credit, paymentTermsDays: days } },
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
      title={`Edit customer — ${c.code}`}
      description="Credit limit, terms and status apply to new quotations, orders and invoices. Every change is logged."
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
          value={v.industry}
          error={errors.industry}
          onChange={(e) => set('industry', e.target.value)}
        />
        <TextField
          label="Tax registration number (TRN)"
          inputMode="numeric"
          hint={`Stored: ${c.trnMasked} · leave empty to keep it`}
          value={v.trn}
          error={errors.trn}
          onChange={(e) => set('trn', e.target.value)}
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
        <TextField
          label="Phone"
          type="tel"
          required
          value={v.contactPhone}
          error={errors.contactPhone}
          onChange={(e) => set('contactPhone', e.target.value)}
        />
        <TextField
          label="Postal address"
          hint="Printed on invoices, e.g. P.O. Box 12345, Dubai, UAE"
          value={v.postalAddress}
          onChange={(e) => set('postalAddress', e.target.value)}
        />
        <TextField
          label="Credit limit (AED)"
          inputMode="decimal"
          required
          value={v.creditLimit}
          error={errors.creditLimit}
          onChange={(e) => set('creditLimit', e.target.value)}
        />
        <SelectField
          label="Payment terms"
          required
          options={terms.options}
          value={v.paymentTermsDays}
          error={errors.paymentTermsDays}
          onChange={(e) => set('paymentTermsDays', e.target.value)}
        />
        <SelectField
          label="Status"
          required
          hint="On hold blocks new orders until released"
          options={STATUSES.map((s) => ({ value: s, label: s }))}
          value={v.status}
          onChange={(e) => set('status', e.target.value)}
        />
        {goingOnHold ? (
          <TextareaField
            label="Reason for the hold"
            required
            placeholder="e.g. Overdue invoices over 90 days"
            value={v.holdReason}
            error={errors.holdReason}
            onChange={(e) => set('holdReason', e.target.value)}
          />
        ) : null}
        {errors.form ? (
          <p role="alert" className="text-caption font-medium text-danger sm:col-span-2">
            {errors.form}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
