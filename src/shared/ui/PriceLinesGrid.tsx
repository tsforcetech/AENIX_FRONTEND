import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { lineMargin } from '@/domain/calc';
import { BUSINESS_LOCALE, formatMoney } from '@/shared/utils/format';
import { Badge } from './Badge';
import { Button } from './Button';
import { Combobox, type ComboOption } from './Combobox';
import { inputClasses } from './Field';
import { Kbd, MOD } from './shortcuts';

export interface GridLine {
  serviceId: string;
  description: string;
  quantity: number | string;
  unit: string;
  unitPrice: number | string;
  unitCost: number | string;
  /** FLOW-003 S6: minimum charge per line (AED / document currency), from the service master. */
  minimumCharge?: number;
  /** FLOW-003 T8: surcharge line accepted by the customer. */
  customerApproved?: boolean;
  /** MASTERS M2: where the suggested price came from ("Customer rate", "Price list", "Cost + 20%"). */
  priceSource?: string;
}

/** FLOW-003 S5/S6/T8: service master flags shown on the line. */
export interface GridServiceMeta {
  isDisbursement?: boolean;
  isSurcharge?: boolean;
  minimumCharge?: number;
}

export type GridLineErrors =
  | Partial<Record<Exclude<keyof GridLine, 'minimumCharge' | 'customerApproved' | 'priceSource'>, string>>
  | undefined;

type Col = 'serviceId' | 'description' | 'quantity' | 'unit' | 'unitPrice' | 'unitCost';

/**
 * Keyboard-first price-line grid used by quotations and sales orders.
 * Tab moves across cells · Enter goes to the next line (adds one on the last) ·
 * ↑/↓ move between lines in the same column · Ctrl/⌘+Delete removes the line.
 * Picking a service fills unit, description and suggested cost/price from the rate card.
 */
export function PriceLinesGrid({
  caption,
  lines,
  keys,
  errors,
  services,
  onPatch,
  onAdd,
  onRemove,
  suggest,
  showCost = true,
  serviceMeta,
  currency,
}: {
  caption: string;
  lines: GridLine[];
  keys: string[];
  errors?: GridLineErrors[];
  services: ComboOption[];
  onPatch: (index: number, patch: Partial<GridLine>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  suggest?: (serviceId: string) => Partial<GridLine>;
  showCost?: boolean;
  /** Service master flags (disbursement, surcharge, minimum charge) by service id. */
  serviceMeta?: (serviceId: string) => GridServiceMeta | undefined;
  /** FLOW-003 C10: document currency for the amounts (default AED). */
  currency?: string;
}) {
  const fmt = (n: number) =>
    currency && currency !== 'AED'
      ? new Intl.NumberFormat(BUSINESS_LOCALE, {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n)
      : formatMoney(n);
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ row: number; col: Col } | null>(null);

  const focusCell = (row: number, col: Col) => {
    const el = gridRef.current?.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col}"]`);
    el?.focus();
  };

  useEffect(() => {
    if (pendingFocus.current) {
      const { row, col } = pendingFocus.current;
      pendingFocus.current = null;
      requestAnimationFrame(() => focusCell(row, col));
    }
  }, [lines.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const row = Number(t.dataset.row);
    const col = t.dataset.col as Col | undefined;
    if (!col || Number.isNaN(row)) return;
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (row === lines.length - 1) {
        pendingFocus.current = { row: row + 1, col: 'serviceId' };
        onAdd();
      } else focusCell(row + 1, col);
    } else if (e.key === 'ArrowDown' && !e.altKey) {
      e.preventDefault();
      if (row < lines.length - 1) focusCell(row + 1, col);
    } else if (e.key === 'ArrowUp' && !e.altKey) {
      e.preventDefault();
      if (row > 0) focusCell(row - 1, col);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (lines.length > 1) {
        onRemove(row);
        requestAnimationFrame(() => focusCell(Math.max(0, row - 1), col));
      }
    }
  };

  const num = (v: number | string) => Number(v) || 0;
  const cell = (i: number, c: Col, extra?: string) => ({
    'data-row': i,
    'data-col': c,
    'aria-invalid': errors?.[i]?.[c] ? true : undefined,
    className: clsx(inputClasses, 'h-9', extra),
  });

  return (
    <div>
      {/* Keyboard handling is delegated from the cells (inputs) inside this container. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div ref={gridRef} onKeyDown={onKeyDown} className="overflow-x-auto" tabIndex={-1}>
        <table className="w-full min-w-[860px] text-left text-body-s">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-caption uppercase tracking-wide text-fg-muted">
              <th scope="col" className="w-8 pb-2 font-medium">
                #
              </th>
              <th scope="col" className="w-56 pb-2 pr-2 font-medium">
                Service
              </th>
              <th scope="col" className="pb-2 pr-2 font-medium">
                Description
              </th>
              <th scope="col" className="w-20 pb-2 pr-2 text-right font-medium">
                Qty
              </th>
              <th scope="col" className="w-24 pb-2 pr-2 font-medium">
                Unit
              </th>
              <th scope="col" className="w-28 pb-2 pr-2 text-right font-medium">
                Unit price
              </th>
              {showCost ? (
                <th scope="col" className="w-28 pb-2 pr-2 text-right font-medium">
                  Unit cost
                </th>
              ) : null}
              <th scope="col" className="w-32 pb-2 pr-2 text-right font-medium">
                Amount
              </th>
              <th scope="col" className="w-10 pb-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const m = lineMargin({
                quantity: num(l.quantity),
                unitPrice: num(l.unitPrice),
                unitCost: num(l.unitCost),
                minimumCharge: l.minimumCharge,
              });
              const raw = num(l.quantity) * num(l.unitPrice);
              const minApplied = !!l.minimumCharge && raw < l.minimumCharge;
              const meta = l.serviceId ? serviceMeta?.(l.serviceId) : undefined;
              return (
                <tr key={keys[i] ?? i} className="group align-top">
                  <td className="py-3 pr-1 text-caption tabular-nums text-fg-muted">{i + 1}</td>
                  <td className="py-1.5 pr-2">
                    <Combobox
                      ariaLabel={`Line ${i + 1} service`}
                      options={services}
                      value={l.serviceId}
                      invalid={!!errors?.[i]?.serviceId}
                      inputProps={{ 'data-row': i, 'data-col': 'serviceId' }}
                      onChange={(serviceId) => {
                        const s = suggest?.(serviceId) ?? {};
                        onPatch(i, {
                          serviceId,
                          unit: s.unit ?? l.unit,
                          description: l.description || s.description || '',
                          minimumCharge: s.minimumCharge,
                          customerApproved: false,
                          ...(num(l.unitCost) === 0 && s.unitCost !== undefined
                            ? { unitCost: s.unitCost }
                            : {}),
                          ...(num(l.unitPrice) === 0 && s.unitPrice !== undefined
                            ? { unitPrice: s.unitPrice, priceSource: s.priceSource }
                            : {}),
                        });
                      }}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      aria-label={`Line ${i + 1} description`}
                      value={l.description}
                      onChange={(e) => onPatch(i, { description: e.target.value })}
                      {...cell(i, 'description')}
                    />
                    {meta?.isDisbursement || meta?.isSurcharge || l.minimumCharge ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                        {meta?.isDisbursement ? (
                          <Badge tone="info" dot={false}>
                            Disbursement — at cost
                          </Badge>
                        ) : null}
                        {l.minimumCharge ? (
                          <span className={clsx(minApplied ? 'font-medium text-warning' : 'text-fg-muted')}>
                            Min. charge {fmt(l.minimumCharge)}
                            {minApplied ? ' — applied' : ''}
                          </span>
                        ) : null}
                        {meta?.isSurcharge ? (
                          <label className="inline-flex items-center gap-1.5 text-fg-secondary">
                            <input
                              type="checkbox"
                              tabIndex={-1}
                              checked={!!l.customerApproved}
                              onChange={(e) => onPatch(i, { customerApproved: e.target.checked })}
                              className="size-3.5 accent-[var(--color-brand)]"
                            />
                            Customer approved
                            <span className="sr-only"> — line {i + 1} surcharge</span>
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      aria-label={`Line ${i + 1} quantity`}
                      inputMode="decimal"
                      value={l.quantity}
                      onChange={(e) => onPatch(i, { quantity: e.target.value })}
                      onFocus={(e) => e.currentTarget.select()}
                      {...cell(i, 'quantity', 'text-right tabular-nums')}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      aria-label={`Line ${i + 1} unit`}
                      value={l.unit}
                      onChange={(e) => onPatch(i, { unit: e.target.value })}
                      {...cell(i, 'unit')}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      aria-label={`Line ${i + 1} unit price`}
                      inputMode="decimal"
                      value={l.unitPrice}
                      onChange={(e) => onPatch(i, { unitPrice: e.target.value, priceSource: undefined })}
                      onFocus={(e) => e.currentTarget.select()}
                      {...cell(i, 'unitPrice', 'text-right tabular-nums')}
                    />
                    {l.priceSource ? (
                      <span className="mt-1 block text-right text-caption text-fg-muted">
                        <span className="sr-only">Line {i + 1} price from: </span>
                        {l.priceSource}
                      </span>
                    ) : null}
                  </td>
                  {showCost ? (
                    <td className="py-1.5 pr-2">
                      <input
                        aria-label={`Line ${i + 1} unit cost`}
                        inputMode="decimal"
                        value={l.unitCost}
                        onChange={(e) => onPatch(i, { unitCost: e.target.value })}
                        onFocus={(e) => e.currentTarget.select()}
                        {...cell(i, 'unitCost', 'text-right tabular-nums')}
                      />
                    </td>
                  ) : null}
                  <td className="py-2 pr-2 text-right">
                    <span className="block font-medium tabular-nums">{fmt(m.amount)}</span>
                    {showCost ? (
                      <>
                        <span className="block text-caption tabular-nums text-fg-muted">
                          cost {fmt(m.cost)}
                        </span>
                        <span
                          className={clsx(
                            'block text-caption tabular-nums',
                            m.margin < 0 ? 'font-medium text-danger' : 'text-fg-muted',
                          )}
                        >
                          {m.margin < 0 ? 'loss ' : 'margin '}
                          {fmt(m.margin)} ({m.marginPct}%)
                        </span>
                      </>
                    ) : null}
                  </td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => onRemove(i)}
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${i + 1}`}
                      className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-danger-subtle hover:text-danger disabled:opacity-30"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-fg-muted">
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus aria-hidden="true" />}
          onClick={() => {
            pendingFocus.current = { row: lines.length, col: 'serviceId' };
            onAdd();
          }}
        >
          Add line
        </Button>
        <span className="flex items-center gap-1">
          <Kbd>Enter</Kbd> next line
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="flex items-center gap-1">
          <Kbd>{MOD}</Kbd>+<Kbd>Del</Kbd> remove
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Alt</Kbd>+<Kbd>N</Kbd> add
        </span>
      </div>
    </div>
  );
}
