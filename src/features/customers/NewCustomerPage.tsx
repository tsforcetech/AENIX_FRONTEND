import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { SelectField, TextField } from '@/shared/ui/Field';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useToast } from '@/shared/ui/Toast';
import { useCreateCustomer } from './api';

const INDUSTRIES = [
  'Construction',
  'General trading',
  'Retail',
  'Healthcare',
  'Food & beverage',
  'Industrial',
  'Electronics',
  'Consumer goods',
  'Other',
];

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the legal name').max(120),
  industry: z.string().min(1, 'Choose an industry'),
  city: z.string().trim().min(2, 'Enter the city').max(60),
  country: z.string().trim().min(2, 'Enter the country').max(60),
  trn: z.union([
    z
      .string()
      .trim()
      .regex(/^\d{15}$/, 'UAE TRN is 15 digits'),
    z.literal(''),
  ]),
  contactName: z.string().trim().min(2, 'Enter a contact name').max(80),
  contactEmail: z.string().trim().email('Enter a valid email'),
  contactPhone: z.string().trim().min(7, 'Enter a phone number').max(20),
  creditLimit: z.coerce.number().min(0, 'Cannot be negative'),
  paymentTermsDays: z.coerce.number().int().min(0, 'Cannot be negative').max(180, 'Max 180 days'),
});
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function NewCustomerPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateCustomer();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { country: 'UAE', paymentTermsDays: 30, creditLimit: 100000, trn: '' },
  });

  const onSubmit = handleSubmit(async (v) => {
    const { customer: c, ledgerCode } = await create.mutateAsync(v);
    toast({
      title: `${c.name} added`,
      body: `${c.code} created with its receivable ledger ${ledgerCode}. Ready for enquiries and quotations.`,
    });
    void navigate({ to: '/customers/$id', params: { id: c.id } });
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New customer"
        crumbs={[{ label: 'Customers', to: '/customers' }, { label: 'New' }]}
        description="Credit limit and terms apply to quotations and invoices. A receivable ledger account (1200-…) is created automatically."
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader title="Company" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Legal name"
              required
              className="sm:col-span-2"
              error={errors.name?.message}
              {...register('name')}
            />
            <SelectField
              label="Industry"
              required
              placeholder="Select industry"
              options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
              error={errors.industry?.message}
              {...register('industry')}
            />
            <TextField
              label="Tax registration number (TRN)"
              inputMode="numeric"
              hint="Optional · stored masked"
              error={errors.trn?.message}
              {...register('trn')}
            />
            <TextField label="City" required error={errors.city?.message} {...register('city')} />
            <TextField label="Country" required error={errors.country?.message} {...register('country')} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Primary contact" />
          <CardBody className="grid gap-5 sm:grid-cols-3">
            <TextField
              label="Contact name"
              required
              error={errors.contactName?.message}
              {...register('contactName')}
            />
            <TextField
              label="Email"
              type="email"
              required
              error={errors.contactEmail?.message}
              {...register('contactEmail')}
            />
            <TextField
              label="Phone"
              type="tel"
              required
              error={errors.contactPhone?.message}
              {...register('contactPhone')}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Credit terms" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Credit limit (AED)"
              type="number"
              inputMode="decimal"
              required
              error={errors.creditLimit?.message}
              {...register('creditLimit')}
            />
            <TextField
              label="Payment terms (days)"
              type="number"
              inputMode="numeric"
              required
              error={errors.paymentTermsDays?.message}
              {...register('paymentTermsDays')}
            />
          </CardBody>
        </Card>
        <div className="flex justify-end gap-2">
          <ButtonLink to="/customers" variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" busy={create.isPending}>
            Create customer
          </Button>
        </div>
      </form>
    </div>
  );
}
