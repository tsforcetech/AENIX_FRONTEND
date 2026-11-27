import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { VendorCategory } from '@/domain/types';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { SelectField, TextField } from '@/shared/ui/Field';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useToast } from '@/shared/ui/Toast';
import { useCreateVendor } from './api';

const CATEGORIES: VendorCategory[] = [
  'Transporter',
  'Shipping line',
  'Airline',
  'Customs broker',
  'Warehouse',
];

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the legal name').max(120),
  category: z.enum(['Transporter', 'Shipping line', 'Airline', 'Customs broker', 'Warehouse'], {
    message: 'Choose a category',
  }),
  city: z.string().trim().min(2, 'Enter the city').max(60),
  country: z.string().trim().min(2, 'Enter the country').max(60),
  contactName: z.string().trim().min(2, 'Enter a contact name').max(80),
  contactEmail: z.string().trim().email('Enter a valid email'),
  paymentTermsDays: z.coerce.number().int().min(0, 'Cannot be negative').max(180, 'Max 180 days'),
});
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function NewVendorPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateVendor();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { country: 'UAE', paymentTermsDays: 30 },
  });

  const onSubmit = handleSubmit(async (v) => {
    const { vendor, ledgerCode } = await create.mutateAsync(v);
    toast({
      title: `${vendor.name} added`,
      body: `${vendor.code} created with its payable ledger ${ledgerCode}. Ready for rates and purchase orders.`,
    });
    void navigate({ to: '/vendors/$id', params: { id: vendor.id } });
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New vendor"
        crumbs={[{ label: 'Vendors', to: '/vendors' }, { label: 'New' }]}
        description="A payable ledger account (2100-…) is created automatically for every vendor."
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
              label="Category"
              required
              placeholder="Select category"
              options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              error={errors.category?.message}
              {...register('category')}
            />
            <TextField
              label="Payment terms (days)"
              type="number"
              inputMode="numeric"
              required
              error={errors.paymentTermsDays?.message}
              {...register('paymentTermsDays')}
            />
            <TextField label="City" required error={errors.city?.message} {...register('city')} />
            <TextField label="Country" required error={errors.country?.message} {...register('country')} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Operations contact" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
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
          </CardBody>
        </Card>
        <div className="flex justify-end gap-2">
          <ButtonLink to="/vendors" variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" busy={create.isPending}>
            Create vendor
          </Button>
        </div>
      </form>
    </div>
  );
}
