import { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { FieldErrors, fieldOptions, getConfig, initialDraft, previewSeries, useSaveMaster } from './api';
import type { ConfigKey } from './config';
import type { Draft, MasterField, MasterRow } from './logic';

/** Add / edit one entry of a master. Locked fields are shown read-only with the reason. */
export function MasterFormDialog({
  masterKey,
  row,
  locked,
  onClose,
}: {
  masterKey: ConfigKey;
  row?: MasterRow;
  locked?: Record<string, string>;
  onClose: () => void;
}) {
  const cfg = getConfig(masterKey);
  const save = useSaveMaster(masterKey);
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(masterKey, row));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const formId = `master-form-${masterKey}`;

  const set = (f: MasterField, v: string | boolean) => {
    setDraft((d) => {
      const next = { ...d, [f.key]: v };
      // Dependent selects (e.g. mode of a category): clear a choice that is no longer offered.
      for (const other of cfg.fields) {
        if (other.type !== 'select' || other.key === f.key || !next[other.key]) continue;
        const offered = fieldOptions(other, next, row).some((o) => o.value === next[other.key]);
        if (!offered && fieldOptions(other, d, row).some((o) => o.value === d[other.key]))
          next[other.key] = '';
      }
      return next;
    });
    setErrors((e) => ({ ...e, [f.key]: '' }));
  };

  const submit = () => {
    setFormError(undefined);
    save.mutate(
      { draft, id: row?.id },
      {
        onSuccess: (saved) => {
          toast({
            title: row
              ? `${cfg.singular[0]!.toUpperCase()}${cfg.singular.slice(1)} saved`
              : `${cfg.singular[0]!.toUpperCase()}${cfg.singular.slice(1)} added`,
            body: String(saved[cfg.nameKey] ?? ''),
          });
          onClose();
        },
        onError: (e) => {
          if (e instanceof FieldErrors) setErrors(e.errors);
          else setFormError(e instanceof Error ? e.message : 'Not saved');
        },
      },
    );
  };
  useFormShortcuts({ onPrimary: submit });

  const title = row ? `Edit ${cfg.singular}` : `Add ${cfg.singular}`;
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={row ? String(row[cfg.nameKey] ?? '') : cfg.purpose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} busy={save.isPending}>
            {row ? 'Save changes' : `Add ${cfg.singular}`}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {cfg.note ? (
          <p className="rounded-lg bg-canvas px-3 py-2 text-caption text-fg-muted">{cfg.note}</p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {cfg.fields
            .filter((f) => !f.hidden)
            .map((f) => {
              const lockReason = row ? locked?.[f.key] : undefined;
              const common = {
                label: f.label,
                required: f.required,
                error: errors[f.key] || undefined,
                hint: lockReason ?? f.hint,
                disabled: !!lockReason,
              };
              if (f.type === 'checkbox')
                return (
                  <label
                    key={f.key}
                    className="flex items-center gap-2 self-end pb-2 text-body-s font-medium"
                  >
                    <input
                      type="checkbox"
                      checked={!!draft[f.key]}
                      disabled={!!lockReason}
                      onChange={(e) => set(f, e.target.checked)}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    {f.label}
                  </label>
                );
              if (f.type === 'select')
                return (
                  <SelectField
                    key={f.key}
                    {...common}
                    placeholder={f.placeholder ?? (f.required ? `Choose ${f.label.toLowerCase()}` : '—')}
                    options={fieldOptions(f, draft, row)}
                    value={String(draft[f.key] ?? '')}
                    onChange={(e) => set(f, e.target.value)}
                  />
                );
              return (
                <TextField
                  key={f.key}
                  {...common}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  step={f.type === 'number' ? (f.integer ? 1 : 'any') : undefined}
                  inputMode={f.type === 'number' ? 'decimal' : undefined}
                  maxLength={f.maxLength}
                  autoCapitalize={f.type === 'code' || f.upper ? 'characters' : undefined}
                  value={String(draft[f.key] ?? '')}
                  onChange={(e) => set(f, e.target.value)}
                />
              );
            })}
        </div>
        {masterKey === 'numberSeries' ? (
          <p className="rounded-lg bg-canvas px-3 py-2 text-body-s" aria-live="polite">
            Next number will look like <span className="font-mono font-medium">{previewSeries(draft)}</span>
          </p>
        ) : null}
        {formError ? <StatusMessage kind="error" title="Not saved" description={formError} /> : null}
      </form>
    </Dialog>
  );
}
