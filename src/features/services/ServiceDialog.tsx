import { useState } from 'react';
import { useMasterOptions } from '@/features/masters/lookups';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextareaField, TextField } from '@/shared/ui/Field';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { useToast } from '@/shared/ui/Toast';
import { useSaveService, useServiceFormData, type ServiceInput, type ServiceRow } from './api';

type Errors = Partial<Record<keyof ServiceInput | 'form', string>>;

/** New / edit service (MASTERS M2): type, unit, tax code, ledgers, billing flags. */
export function ServiceDialog({ service, onClose }: { service: ServiceRow | null; onClose: () => void }) {
  const formData = useServiceFormData();
  const units = useMasterOptions('unitsOfMeasure');
  const taxCodes = useMasterOptions('taxCodes');
  const save = useSaveService();
  const toast = useToast();
  const types = formData.data?.serviceTypes ?? [];
  const initialType =
    service?.serviceTypeId ?? types.find((t) => t.mode === service?.mode)?.value ?? types[0]?.value ?? '';
  const [v, setV] = useState<ServiceInput>(() => ({
    code: service?.code ?? '',
    name: service?.name ?? '',
    serviceTypeId: initialType,
    unit: service?.unit ?? '',
    taxCodeId: service?.taxCodeId ?? '',
    incomeAccountId: service?.incomeAccountId ?? '',
    costAccountId: service?.costAccountId ?? '',
    description: service?.description ?? '',
    isDisbursement: !!service?.isDisbursement,
    isSurcharge: !!service?.isSurcharge,
    minimumCharge: service?.minimumCharge ?? 0,
  }));
  const [minText, setMinText] = useState(String(service?.minimumCharge ?? 0));
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof ServiceInput>(k: K, val: ServiceInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const type = types.find((t) => t.value === (v.serviceTypeId || initialType));
  const serviceTypeId = v.serviceTypeId || initialType;

  const unitOptions = [...(units.data ?? [])];
  if (v.unit && !unitOptions.some((u) => u.value === v.unit))
    unitOptions.push({ value: v.unit, label: `${v.unit} (not in the master)` });

  const submit = () => {
    const min = minText.trim() === '' ? 0 : Number(minText);
    const e: Errors = {};
    if (v.code.trim().length < 2) e.code = 'Enter a code (at least 2 characters)';
    else if (!/^[A-Za-z0-9-]+$/.test(v.code.trim())) e.code = 'Use letters, numbers and dashes only';
    if (v.name.trim().length < 2) e.name = 'Enter the service name';
    if (!serviceTypeId) e.serviceTypeId = 'Choose a service type';
    if (!v.unit) e.unit = 'Choose a unit';
    if (!Number.isFinite(min) || min < 0) e.minimumCharge = 'Enter 0 or more';
    if (v.isDisbursement && v.isSurcharge) e.form = 'Choose disbursement or surcharge, not both';
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate(
      { id: service?.id, input: { ...v, serviceTypeId, minimumCharge: min } },
      {
        onSuccess: (s) => {
          toast({ title: service ? `${s.name} updated` : `${s.name} added`, body: `Code ${s.code}` });
          onClose();
        },
        onError: (err) =>
          setErrors(err.message.startsWith('Code') ? { code: err.message } : { form: err.message }),
      },
    );
  };
  useFormShortcuts({ onSave: submit, onPrimary: submit });

  const box = 'size-4 accent-[var(--color-brand)]';
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={service ? `Edit service — ${service.name}` : 'New service'}
      description="Services are offered on quotations, sales orders and jobs. The service type sets the job steps and the default ledgers."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={submit}>
            {service ? 'Save changes' : 'Add service'}
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          label="Code"
          required
          hint="Unique, e.g. TRK-3T"
          value={v.code}
          error={errors.code}
          onChange={(e) => set('code', e.target.value.toUpperCase())}
        />
        <TextField
          label="Name"
          required
          value={v.name}
          error={errors.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <SelectField
          label="Service type"
          required
          placeholder="Select service type"
          hint={type ? `Mode: ${type.mode === 'Customs' ? 'Direct service' : type.mode}` : undefined}
          options={types.map((t) => ({ value: t.value, label: t.label }))}
          value={serviceTypeId}
          error={errors.serviceTypeId}
          onChange={(e) => {
            const t = types.find((x) => x.value === e.target.value);
            setV((p) => ({
              ...p,
              serviceTypeId: e.target.value,
              incomeAccountId: t?.incomeAccountId ?? p.incomeAccountId,
              costAccountId: t?.costAccountId ?? p.costAccountId,
            }));
          }}
        />
        <SelectField
          label="Unit"
          required
          placeholder="Select unit"
          options={unitOptions}
          value={v.unit}
          error={errors.unit}
          onChange={(e) => set('unit', e.target.value)}
        />
        <SelectField
          label="Default tax code"
          placeholder="Company default (standard 5%)"
          options={taxCodes.data ?? []}
          value={v.taxCodeId ?? ''}
          onChange={(e) => set('taxCodeId', e.target.value)}
        />
        <TextField
          label="Minimum charge per line (AED)"
          inputMode="decimal"
          hint="0 = no minimum"
          value={minText}
          error={errors.minimumCharge}
          onChange={(e) => setMinText(e.target.value)}
        />
        <SelectField
          label="Income ledger"
          placeholder={
            type?.incomeAccountId
              ? `From service type (${formData.data?.incomeAccounts.find((a) => a.value === type.incomeAccountId)?.label ?? '—'})`
              : 'Select income ledger'
          }
          options={formData.data?.incomeAccounts ?? []}
          value={v.incomeAccountId ?? ''}
          onChange={(e) => set('incomeAccountId', e.target.value)}
        />
        <SelectField
          label="Cost ledger"
          placeholder={
            type?.costAccountId
              ? `From service type (${formData.data?.costAccounts.find((a) => a.value === type.costAccountId)?.label ?? '—'})`
              : 'Select cost ledger'
          }
          options={formData.data?.costAccounts ?? []}
          value={v.costAccountId ?? ''}
          onChange={(e) => set('costAccountId', e.target.value)}
        />
        <TextareaField
          label="Description"
          className="sm:col-span-2"
          value={v.description}
          onChange={(e) => set('description', e.target.value)}
        />
        <fieldset className="space-y-3 text-body-s sm:col-span-2">
          <legend className="mb-2 font-medium text-fg">Billing</legend>
          <label className="flex items-start gap-3 font-medium">
            <input
              type="checkbox"
              className={`${box} mt-0.5`}
              checked={v.isDisbursement}
              onChange={(e) => set('isDisbursement', e.target.checked)}
            />
            <span>
              Disbursement
              <span className="block text-caption font-normal text-fg-muted">
                Paid for the customer (duty, port fees) and rebilled at cost — not revenue.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 font-medium">
            <input
              type="checkbox"
              className={`${box} mt-0.5`}
              checked={v.isSurcharge}
              onChange={(e) => set('isSurcharge', e.target.checked)}
            />
            <span>
              Surcharge
              <span className="block text-caption font-normal text-fg-muted">
                Waiting, demurrage, extra stop, after-hours — each line needs the customer’s approval.
              </span>
            </span>
          </label>
        </fieldset>
        {errors.form ? (
          <p role="alert" className="text-caption font-medium text-danger sm:col-span-2">
            {errors.form}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
