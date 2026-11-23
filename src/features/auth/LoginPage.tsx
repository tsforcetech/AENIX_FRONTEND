import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Handshake,
  PackageCheck,
  Route,
  UserRound,
  Warehouse,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PROTOTYPE_MODE } from '@/prototype/config';
import { prototypeLoginHint } from '@/prototype/seed';
import { prototypeSignIn, useSession, type ActorType } from '@/shared/auth/session';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/Field';
import { Logo } from '@/shared/ui/Logo';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { RouteNetwork } from './RouteNetwork';

const schema = z.object({
  identifier: z.string().trim().min(1, 'Enter your work email or user ID').max(254),
  password: z.string().min(1, 'Enter your password').max(256),
  remember: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const personas: { value: ActorType; label: string; icon: typeof UserRound; home: string }[] = [
  { value: 'staff', label: 'Staff', icon: UserRound, home: '/home' },
  { value: 'customer', label: 'Customer', icon: Building2, home: '/portal' },
  { value: 'vendor', label: 'Vendor', icon: Handshake, home: '/vendor-portal' },
];

const highlights = [
  {
    icon: Route,
    title: 'Enquiry to cash, one flow',
    body: 'Quote, confirm, run the job, invoice and collect without re-keying.',
  },
  {
    icon: PackageCheck,
    title: 'Live job milestones',
    body: 'Every work order tracked from booking to proof of delivery.',
  },
  {
    icon: Warehouse,
    title: '3PL warehouse built in',
    body: 'Receipts, dispatches and storage billing on the same ledger.',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const session = useSession();
  const [persona, setPersona] = useState<ActorType>('staff');
  const [showPassword, setShowPassword] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      identifier: prototypeLoginHint,
      password: PROTOTYPE_MODE ? 'prototype' : '',
      remember: false,
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!PROTOTYPE_MODE) {
      setUnavailable(true);
      return;
    }
    await new Promise((r) => setTimeout(r, 450));
    prototypeSignIn(values.identifier, persona);
    void navigate({ to: personas.find((p) => p.value === persona)!.home });
  };

  if (session.status === 'authenticated') {
    const home = personas.find((p) => p.value === session.principal?.actorType)?.home ?? '/home';
    return <Navigate to={home} replace />;
  }

  return (
    <main
      id="main-content"
      className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
    >
      {/* Form side */}
      <section className="flex flex-col px-6 py-8 sm:px-12 lg:px-16 xl:px-24">
        <Logo height={40} />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <p className="font-mono text-caption font-medium uppercase tracking-[0.14em] text-brand">
            AENIX ERP
          </p>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.15] tracking-tight text-fg">
            Welcome back
          </h1>
          <p className="mt-2 text-body-s text-fg-muted">
            Sign in with your work email or user ID to manage jobs, warehouse and finance.
          </p>

          {PROTOTYPE_MODE ? (
            <fieldset className="mt-8">
              <legend className="mb-2 flex items-center gap-2 text-caption font-medium text-fg-muted">
                Prototype persona
                <span className="rounded bg-surface-inverse px-1.5 py-px font-mono text-[10px] uppercase text-fg-inverse">
                  demo
                </span>
              </legend>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-muted p-1">
                {personas.map((p) => {
                  const Icon = p.icon;
                  const checked = persona === p.value;
                  return (
                    <label
                      key={p.value}
                      className={clsx(
                        'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-body-s font-medium transition-all has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                        checked ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                      )}
                    >
                      <input
                        type="radio"
                        name="persona"
                        value={p.value}
                        checked={checked}
                        onChange={() => setPersona(p.value)}
                        className="sr-only"
                      />
                      <Icon aria-hidden="true" className="size-4" />
                      {p.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-5">
            <TextField
              label="Email or user ID"
              autoComplete="username"
              placeholder="name@company.com"
              error={errors.identifier?.message}
              {...register('identifier')}
            />
            <div className="relative">
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                error={errors.password?.message}
                labelAside={
                  <button
                    type="button"
                    className="text-caption font-medium text-brand hover:underline"
                    onClick={() =>
                      toast({
                        title: 'Password reset',
                        body: 'Reset by email is enabled once the identity service is connected.',
                      })
                    }
                  >
                    Forgot password?
                  </button>
                }
                className="[&_input]:pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-2 top-[31px] grid size-8 place-items-center rounded-md text-fg-muted hover:text-fg"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
            <label className="flex items-center gap-2 text-body-s text-fg-secondary">
              <input
                type="checkbox"
                className="size-4 rounded border-border accent-[var(--color-brand)]"
                {...register('remember')}
              />
              Remember this device
            </label>
            <Button type="submit" busy={isSubmitting} className="h-11 w-full text-[15px]">
              Sign in <ArrowRight aria-hidden="true" />
            </Button>
            {unavailable ? (
              <StatusMessage
                kind="denied"
                title="Sign-in isn’t available yet"
                description="The AENIX identity service (ADR-004) is not connected in this build."
              />
            ) : null}
          </form>
          {PROTOTYPE_MODE ? (
            <p className="mt-4 text-center text-caption text-fg-muted">
              Prototype: any credentials work. No data leaves your browser.
            </p>
          ) : null}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <span>© 2026 AENIX</span>
          <span>Need access? Contact your administrator</span>
        </footer>
      </section>

      {/* Brand side */}
      <section
        aria-label="About AENIX"
        className="relative hidden overflow-hidden bg-[#141313] text-white lg:flex lg:flex-col"
      >
        <div
          aria-hidden="true"
          className="absolute -right-32 -top-40 size-[560px] rounded-full bg-[#9a2119] opacity-35 blur-[140px]"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-48 -left-24 size-[420px] rounded-full bg-[#9a2119] opacity-20 blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div className="relative flex flex-1 flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/5 px-3 py-1 text-caption text-white/80 backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-[#ef4444]" /> UAE · GCC transport, 3PL &
            finance
          </div>
          <div className="mx-auto w-full max-w-xl py-8">
            <RouteNetwork />
          </div>
          <div className="space-y-8">
            <h2 className="max-w-lg text-[40px] font-semibold leading-[1.1] tracking-tight">
              Keep every shipment, pallet and invoice <span className="text-[#ef5a4f]">moving.</span>
            </h2>
            <ul className="grid gap-3 xl:grid-cols-3">
              {highlights.map((h) => (
                <li
                  key={h.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"
                >
                  <h.icon aria-hidden="true" className="size-5 text-[#ef5a4f]" />
                  <p className="mt-3 text-body-s font-semibold">{h.title}</p>
                  <p className="mt-1 text-caption leading-[1.4] text-white/60">{h.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
