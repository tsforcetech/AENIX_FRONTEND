import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { protoDb, useProtoDb } from '@/prototype/store';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { inputClasses } from './Field';

/**
 * Excel / CSV import with column mapping (PL, GRN, POD, …).
 * Customers and vendors send their own spreadsheets; staff map the columns once per party and
 * the mapping is remembered. Parsing happens in the browser for the preview only — the backend
 * re-validates every imported line (API-DEP-27).
 */
export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number';
  /** Header names that auto-map to this field (lower-case). */
  aliases?: string[];
}

export type ImportedRow = Record<string, string | number>;

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
type Cell = string | number | boolean | Date | null;

function cellText(c: Cell | undefined): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, commas/semicolons, CRLF). */
export function parseCsv(text: string): string[][] {
  const delimiter =
    (text.split('\n')[0] ?? '').split(';').length > (text.split('\n')[0] ?? '').split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delimiter) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function parseNumber(v: string): number | null {
  const cleaned = v.replace(/[,\s]/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function guessMapping(headers: string[], fields: ImportField[], saved?: Record<string, string>) {
  const map: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of fields) {
    const savedHeader = saved?.[f.key];
    let idx = savedHeader !== undefined ? headers.findIndex((h) => norm(h) === norm(savedHeader)) : -1;
    if (idx < 0) {
      const names = [f.label, f.key, ...(f.aliases ?? [])].map(norm);
      idx = headers.findIndex((h, i) => !used.has(i) && names.includes(norm(h)));
      if (idx < 0)
        idx = headers.findIndex((h, i) => !used.has(i) && names.some((n) => n && norm(h).includes(n)));
    }
    if (idx >= 0) {
      map[f.key] = idx;
      used.add(idx);
    }
  }
  return map;
}

export function SpreadsheetImport({
  open,
  onClose,
  title,
  description,
  fields,
  templateKey,
  partyName,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  fields: ImportField[];
  /** e.g. `PL:cus-3` — remembered mapping per document type and party. */
  templateKey: string;
  partyName?: string;
  onImport: (rows: ImportedRow[], file: { name: string; sizeKb: number }) => void;
}) {
  const fileId = useId();
  const savedTemplate = useProtoDb((db) => db.importTemplates[templateKey]);
  const [file, setFile] = useState<{ name: string; sizeKb: number } | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [remember, setRemember] = useState(true);
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setTable(null);
    setHeaderRow(0);
    setMapping({});
    setError(null);
  };

  const headers = useMemo(
    () => (table?.[headerRow] ?? []).map((h, i) => h || `Column ${i + 1}`),
    [table, headerRow],
  );
  const dataRows = useMemo(() => (table ? table.slice(headerRow + 1) : []), [table, headerRow]);

  const mapped = useMemo(() => {
    return dataRows.map((r, n) => {
      const row: ImportedRow = {};
      const problems: string[] = [];
      for (const f of fields) {
        const idx = mapping[f.key];
        const raw = idx === undefined ? '' : (r[idx] ?? '').trim();
        if (f.type === 'number') {
          const num = raw === '' ? null : parseNumber(raw);
          if (num === null) {
            if (f.required) problems.push(`${f.label} missing or not a number`);
          } else row[f.key] = num;
        } else {
          if (!raw && f.required) problems.push(`${f.label} missing`);
          if (raw) row[f.key] = raw;
        }
      }
      return { n: headerRow + 2 + n, row, problems };
    });
  }, [dataRows, fields, mapping, headerRow]);

  const invalid = mapped.filter((m) => m.problems.length).length;
  const missingRequired = fields.filter((f) => f.required && mapping[f.key] === undefined);

  const onFile = async (f: File | undefined) => {
    reset();
    if (!f) return;
    if (f.size > MAX_BYTES)
      return setError('The file is larger than 5 MB. Split it or remove unused sheets.');
    const ext = f.name.toLowerCase().split('.').pop();
    setBusy(true);
    try {
      let rows: string[][];
      if (ext === 'csv' || ext === 'txt') rows = parseCsv(await f.text());
      else if (ext === 'xlsx') {
        const { readSheet } = await import('read-excel-file/browser');
        const data = (await readSheet(f)) as Cell[][];
        rows = data.map((r) => r.map(cellText)).filter((r) => r.some((c) => c !== ''));
      } else {
        setBusy(false);
        return setError(
          'Use an Excel workbook (.xlsx) or a CSV file. Older .xls files: save as .xlsx first.',
        );
      }
      if (rows.length > MAX_ROWS + 1)
        return setError(`The sheet has more than ${MAX_ROWS} rows. Split it into smaller files.`);
      // Header row = first row (within the first 10) that has text in at least two cells.
      const h = Math.max(
        0,
        rows.slice(0, 10).findIndex((r) => r.filter((c) => c && Number.isNaN(Number(c))).length >= 2),
      );
      setFile({ name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) });
      setTable(rows);
      setHeaderRow(h);
      setMapping(guessMapping(rows[h] ?? [], fields, savedTemplate));
    } catch {
      setError('This file could not be read. Check it opens in Excel and is not password-protected.');
    } finally {
      setBusy(false);
    }
  };

  const doImport = () => {
    const rows = mapped.filter((m) => !m.problems.length).map((m) => m.row);
    if (remember) {
      const tpl: Record<string, string> = {};
      for (const f of fields) if (mapping[f.key] !== undefined) tpl[f.key] = headers[mapping[f.key]!]!;
      protoDb.update((db) => ({ ...db, importTemplates: { ...db.importTemplates, [templateKey]: tpl } }));
    }
    onImport(rows, file!);
    reset();
    onClose();
  };

  const downloadTemplate = () => {
    const csv = `${fields.map((f) => f.label).join(',')}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="lg"
      title={title}
      description={description ?? 'Upload the Excel or CSV file you received and map its columns once.'}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={
              !table ||
              missingRequired.length > 0 ||
              mapped.length - invalid === 0 ||
              (!skipInvalid && invalid > 0)
            }
            onClick={doImport}
          >
            Import {Math.max(0, mapped.length - invalid)} line{mapped.length - invalid === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!table ? (
          <label
            htmlFor={fileId}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-canvas px-6 py-10 text-center hover:border-border-strong has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload aria-hidden="true" className="size-6 text-fg-muted" />
            <span className="text-body-s font-medium">
              {busy ? 'Reading file…' : 'Drop the file here or choose a file'}
            </span>
            <span className="text-caption text-fg-muted">
              Excel .xlsx or .csv · up to 5 MB and {MAX_ROWS.toLocaleString()} rows
            </span>
            <input
              id={fileId}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-canvas px-3 py-2.5 text-body-s">
            <FileSpreadsheet aria-hidden="true" className="size-5 text-success" />
            <span className="min-w-0 flex-1 truncate font-medium">{file?.name}</span>
            <span className="text-caption text-fg-muted">
              {dataRows.length} data rows · {headers.length} columns
            </span>
            <button
              type="button"
              onClick={reset}
              className="text-caption font-medium text-brand hover:underline"
            >
              Choose another file
            </button>
          </div>
        )}
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-danger-subtle px-3 py-2.5 text-body-s text-danger"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        ) : null}
        {!table ? (
          <p className="text-caption text-fg-muted">
            Expected columns: {fields.map((f) => `${f.label}${f.required ? ' *' : ''}`).join(' · ')}.{' '}
            <button type="button" onClick={downloadTemplate} className="font-medium text-brand underline">
              Download a CSV template
            </button>
            {savedTemplate
              ? ` A saved mapping exists${partyName ? ` for ${partyName}` : ''} and will be applied.`
              : null}
          </p>
        ) : (
          <>
            <section aria-labelledby={`${fileId}-map`} className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h3 id={`${fileId}-map`} className="text-body-s font-semibold">
                  Map columns
                </h3>
                <label className="flex items-center gap-2 text-caption text-fg-muted">
                  Header row
                  <select
                    value={headerRow}
                    onChange={(e) => {
                      const h = Number(e.target.value);
                      setHeaderRow(h);
                      setMapping(guessMapping(table[h] ?? [], fields, savedTemplate));
                    }}
                    className={clsx(inputClasses, 'h-8 w-20')}
                  >
                    {table.slice(0, 10).map((_, i) => (
                      <option key={i} value={i}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((f) => (
                  <label key={f.key} className="space-y-1">
                    <span className="block text-caption font-medium">
                      {f.label}
                      {f.required ? <span className="text-brand"> *</span> : null}
                    </span>
                    <select
                      value={mapping[f.key] ?? ''}
                      aria-invalid={f.required && mapping[f.key] === undefined ? true : undefined}
                      onChange={(e) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (e.target.value === '') delete next[f.key];
                          else next[f.key] = Number(e.target.value);
                          return next;
                        })
                      }
                      className={clsx(inputClasses, 'h-9')}
                    >
                      <option value="">— Not in file —</option>
                      {headers.map((h, i) => (
                        <option key={`${h}-${i}`} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section aria-label="Preview" className="space-y-2">
              <div
                role="status"
                className={clsx(
                  'flex items-start gap-2 rounded-lg px-3 py-2 text-body-s',
                  missingRequired.length || invalid
                    ? 'bg-warning-subtle text-warning'
                    : 'bg-success-subtle text-success',
                )}
              >
                {missingRequired.length || invalid ? (
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                )}
                <span>
                  {missingRequired.length
                    ? `Map the required field${missingRequired.length > 1 ? 's' : ''}: ${missingRequired.map((f) => f.label).join(', ')}.`
                    : invalid
                      ? `${mapped.length - invalid} rows ready · ${invalid} rows have problems.`
                      : `All ${mapped.length} rows are ready to import.`}
                </span>
              </div>
              <div
                className="max-h-64 overflow-auto rounded-lg border border-border-subtle"
                tabIndex={0}
                role="region"
                aria-label="Import preview"
              >
                <table className="w-full text-left text-caption">
                  <thead className="sticky top-0 bg-canvas">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-medium text-fg-muted">
                        Row
                      </th>
                      {fields.map((f) => (
                        <th key={f.key} scope="col" className="px-2 py-1.5 font-medium text-fg-muted">
                          {f.label}
                        </th>
                      ))}
                      <th scope="col" className="px-2 py-1.5 font-medium text-fg-muted">
                        Check
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapped.slice(0, 50).map((m) => (
                      <tr
                        key={m.n}
                        className={clsx(
                          'border-t border-border-subtle',
                          m.problems.length && 'bg-danger-subtle/50',
                        )}
                      >
                        <td className="px-2 py-1.5 tabular-nums text-fg-muted">{m.n}</td>
                        {fields.map((f) => (
                          <td
                            key={f.key}
                            className={clsx('px-2 py-1.5', f.type === 'number' && 'tabular-nums')}
                          >
                            {m.row[f.key] ?? '—'}
                          </td>
                        ))}
                        <td className="px-2 py-1.5">
                          {m.problems.length ? (
                            <span className="text-danger">{m.problems.join('; ')}</span>
                          ) : (
                            'OK'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mapped.length > 50 ? (
                <p className="text-caption text-fg-muted">Showing the first 50 of {mapped.length} rows.</p>
              ) : null}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-body-s">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={skipInvalid}
                    onChange={(e) => setSkipInvalid(e.target.checked)}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  Skip rows with problems
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  Remember this mapping{partyName ? ` for ${partyName}` : ''}
                </label>
              </div>
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Standard field sets for warehouse documents. */
export const PL_FIELDS: ImportField[] = [
  {
    key: 'sku',
    label: 'SKU / item code',
    required: true,
    aliases: ['sku', 'item code', 'item', 'code', 'part no', 'part number', 'article', 'material'],
  },
  {
    key: 'description',
    label: 'Description',
    aliases: ['description', 'item description', 'desc', 'product', 'product name', 'name'],
  },
  {
    key: 'quantity',
    label: 'Quantity',
    required: true,
    type: 'number',
    aliases: ['qty', 'quantity', 'pcs', 'units', 'expected qty', 'ordered qty'],
  },
  { key: 'uom', label: 'Unit', aliases: ['uom', 'unit', 'units of measure', 'pack'] },
];

export const GRN_FIELDS: ImportField[] = [
  {
    key: 'sku',
    label: 'SKU / item code',
    required: true,
    aliases: ['sku', 'item code', 'item', 'code', 'part no', 'article'],
  },
  {
    key: 'receivedQty',
    label: 'Received quantity',
    required: true,
    type: 'number',
    aliases: ['received', 'received qty', 'qty received', 'grn qty', 'actual qty', 'qty'],
  },
  {
    key: 'damagedQty',
    label: 'Damaged quantity',
    type: 'number',
    aliases: ['damaged', 'damaged qty', 'damage', 'rejected', 'bad qty'],
  },
  { key: 'remarks', label: 'Remarks', aliases: ['remarks', 'remark', 'comments', 'comment', 'notes'] },
];

export const POD_FIELDS: ImportField[] = [
  {
    key: 'sku',
    label: 'SKU / item code',
    required: true,
    aliases: ['sku', 'item code', 'item', 'code', 'part no', 'article'],
  },
  {
    key: 'deliveredQty',
    label: 'Delivered quantity',
    required: true,
    type: 'number',
    aliases: ['delivered', 'delivered qty', 'qty delivered', 'pod qty', 'received by customer', 'qty'],
  },
  { key: 'remarks', label: 'Remarks', aliases: ['remarks', 'remark', 'comments', 'notes', 'reason'] },
];

export const REQUEST_FIELDS: ImportField[] = PL_FIELDS;
