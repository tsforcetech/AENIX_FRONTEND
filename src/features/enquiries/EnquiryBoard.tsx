import { Link, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { ArrowRightLeft, CalendarClock, FileText, GripVertical, Lock } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { EnquiryStatus } from '@/domain/types';
import { ServiceIcons, locationTextMulti } from '@/features/sales-orders/commercial-ui';
import { jobKindLabel } from '@/domain/workflow';
import type { ListParams } from '@/shared/data/paging';
import { usePopover } from '@/shared/layout/usePopover';
import { Avatar } from '@/shared/ui/Avatar';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { TextareaField } from '@/shared/ui/Field';
import { DocRef } from '@/shared/ui/Money';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { BUSINESS_LOCALE, BUSINESS_TIME_ZONE } from '@/shared/utils/format';

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat(BUSINESS_LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(`${iso}T12:00:00+04:00`));
import { useEnquiryBoard, useMoveEnquiry, type EnquiryBoardRow } from './api';

export const BOARD_COLUMNS: EnquiryStatus[] = ['New', 'Quoting', 'Quoted', 'Won', 'Lost'];
const FINAL: EnquiryStatus[] = ['Won', 'Lost'];
const MAX_PER_COLUMN = 50;
/** Prototype "today" for overdue highlighting. */
const TODAY = '2026-11-27';

const columnHint: Record<EnquiryStatus, string> = {
  New: 'Just logged',
  Quoting: 'Quotation in preparation',
  Quoted: 'Quotation sent',
  Won: 'Sales order confirmed',
  Lost: 'Closed without order',
};

interface Picked {
  id: string;
  number: string;
  from: EnquiryStatus;
  target: EnquiryStatus;
}

export function EnquiryBoard({ params }: { params: ListParams }) {
  const { data, isLoading, error } = useEnquiryBoard(params);
  const move = useMoveEnquiry();
  const toast = useToast();
  const [dragOver, setDragOver] = useState<EnquiryStatus | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [announce, setAnnounce] = useState('');
  const [lostFor, setLostFor] = useState<EnquiryBoardRow | null>(null);
  const [wonBlocked, setWonBlocked] = useState<EnquiryBoardRow | null>(null);
  const cardRefs = useRef(new Map<string, HTMLAnchorElement>());

  const rows = data ?? [];
  const byStatus = (s: EnquiryStatus) => rows.filter((r) => r.status === s);

  /** Applies the board rules, then moves (or opens the needed dialog). Returns true if moved now. */
  const attemptMove = (row: EnquiryBoardRow, to: EnquiryStatus): boolean => {
    if (to === row.status) return false;
    if (row.status === 'Won') {
      toast({
        title: `${row.number} cannot be moved`,
        body: 'Won enquiries are closed by their sales order.',
      });
      return false;
    }
    if (row.status === 'Lost') {
      toast({
        title: `${row.number} cannot be moved`,
        body: 'Lost enquiries are closed. Log a new enquiry instead.',
      });
      return false;
    }
    if (to === 'Won' && !row.hasAcceptedQuotation && !row.hasSalesOrder) {
      setWonBlocked(row);
      return false;
    }
    if (to === 'Lost') {
      setLostFor(row);
      return false;
    }
    move.mutate(
      { id: row.id, status: to },
      { onSuccess: () => toast({ title: `${row.number} moved to ${to}` }) },
    );
    setAnnounce(`${row.number} moved to ${to}.`);
    return true;
  };

  // Keep focus on the moved card after the board re-renders.
  const focusCard = (id: string) => setTimeout(() => cardRefs.current.get(id)?.focus(), 0);

  const onCardKeyDown = (e: KeyboardEvent<HTMLAnchorElement>, row: EnquiryBoardRow) => {
    if (!picked) {
      if (e.key === ' ') {
        e.preventDefault();
        if (FINAL.includes(row.status)) {
          attemptMove(row, row.status === 'Won' ? 'Lost' : 'New'); // shows the explanation toast
          return;
        }
        setPicked({ id: row.id, number: row.number, from: row.status, target: row.status });
        setAnnounce(
          `Picked up ${row.number}. Use left and right arrows to choose a column, Space to drop, Escape to cancel.`,
        );
      }
      return;
    }
    if (picked.id !== row.id) return;
    const i = BOARD_COLUMNS.indexOf(picked.target);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next =
        BOARD_COLUMNS[
          Math.max(0, Math.min(BOARD_COLUMNS.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))
        ]!;
      setPicked({ ...picked, target: next });
      setAnnounce(`${next} column.`);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const target = picked.target;
      setPicked(null);
      if (target === picked.from) {
        setAnnounce(`${row.number} dropped back in ${target}.`);
        return;
      }
      if (attemptMove(row, target)) focusCard(row.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setPicked(null);
      setAnnounce(`Move cancelled. ${row.number} stays in ${picked.from}.`);
    }
  };

  const onDrop = (e: DragEvent<HTMLElement>, to: EnquiryStatus) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const row = rows.find((r) => r.id === id);
    if (row) attemptMove(row, to);
  };

  if (error) return <StatusMessage kind="error" title="Could not load the board" />;

  return (
    <div className="space-y-3">
      <p className="sr-only" aria-live="assertive">
        {announce}
      </p>
      <p className="text-caption text-fg-muted">
        Drag a card to another column, or focus a card and press <kbd className="font-mono">Space</kbd>, then{' '}
        <kbd className="font-mono">←</kbd> <kbd className="font-mono">→</kbd> and{' '}
        <kbd className="font-mono">Space</kbd> to drop. Showing the latest {rows.length} matching enquiries.
      </p>
      <div
        role="region"
        aria-label="Enquiry board"
        tabIndex={0}
        className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-3"
        aria-busy={isLoading || undefined}
      >
        {BOARD_COLUMNS.map((status) => {
          const all = byStatus(status);
          const cards = all.slice(0, MAX_PER_COLUMN);
          const isTarget =
            dragOver === status || (picked && picked.target === status && picked.from !== status);
          const headingId = `col-${status}`;
          return (
            <section
              key={status}
              aria-labelledby={headingId}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOver(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
              }}
              onDrop={(e) => onDrop(e, status)}
              className={clsx(
                'flex min-w-[260px] flex-1 flex-col rounded-xl border bg-canvas transition-colors',
                isTarget ? 'border-brand bg-brand-subtle/60 ring-2 ring-brand/30' : 'border-border-subtle',
              )}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2.5">
                <div className="min-w-0">
                  <h2 id={headingId} className="flex items-center gap-2 text-body-s font-semibold">
                    {status}
                    <span className="rounded-full bg-surface px-2 text-caption font-medium tabular-nums text-fg-muted ring-1 ring-inset ring-border">
                      {all.length}
                    </span>
                    {FINAL.includes(status) ? (
                      <Lock aria-label="Final stage" className="size-3.5 text-fg-muted" />
                    ) : null}
                  </h2>
                  <p className="text-caption text-fg-muted">{columnHint[status]}</p>
                </div>
              </header>
              <ol className="flex flex-1 flex-col gap-2 p-2" aria-label={`${status} enquiries`}>
                {isLoading && !data
                  ? Array.from({ length: 2 }, (_, i) => (
                      <li key={i} className="h-28 animate-pulse rounded-lg bg-surface" />
                    ))
                  : null}
                {!isLoading && cards.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-caption text-fg-muted">
                    No enquiries
                  </li>
                ) : null}
                {cards.map((row) => (
                  <li key={row.id}>
                    <EnquiryCard
                      row={row}
                      picked={picked?.id === row.id}
                      cardRef={(el) => {
                        if (el) cardRefs.current.set(row.id, el);
                        else cardRefs.current.delete(row.id);
                      }}
                      onKeyDown={(e) => onCardKeyDown(e, row)}
                      onMoveTo={(to) => attemptMove(row, to)}
                    />
                  </li>
                ))}
                {all.length > MAX_PER_COLUMN ? (
                  <li>
                    <Link
                      to="/enquiries"
                      search={{ view: 'list', status }}
                      className="block rounded-lg px-3 py-2 text-center text-caption font-medium text-brand underline"
                    >
                      View all {all.length} in list
                    </Link>
                  </li>
                ) : null}
              </ol>
            </section>
          );
        })}
      </div>

      <LostReasonDialog
        row={lostFor}
        onClose={() => setLostFor(null)}
        onConfirm={(reason) => {
          const row = lostFor!;
          setLostFor(null);
          move.mutate(
            { id: row.id, status: 'Lost', lostReason: reason },
            { onSuccess: () => toast({ title: `${row.number} moved to Lost`, body: `Reason: ${reason}` }) },
          );
          setAnnounce(`${row.number} moved to Lost.`);
        }}
      />
      <Dialog
        open={!!wonBlocked}
        onClose={() => setWonBlocked(null)}
        title="Can’t mark as won yet"
        description={
          wonBlocked
            ? `${wonBlocked.number} has no accepted quotation or sales order. An enquiry is won when the customer confirms the order.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setWonBlocked(null)}>
              Close
            </Button>
            {wonBlocked ? (
              <ButtonLink to="/sales-orders/new" search={{ enquiryId: wonBlocked.id }}>
                Create sales order
              </ButtonLink>
            ) : null}
          </>
        }
      >
        <p className="text-body-s text-fg-secondary">
          Create the sales order from this enquiry (or accept its quotation). The enquiry moves to Won
          automatically when the sales order is confirmed.
        </p>
      </Dialog>
    </div>
  );
}

function EnquiryCard({
  row,
  picked,
  cardRef,
  onKeyDown,
  onMoveTo,
}: {
  row: EnquiryBoardRow;
  picked: boolean;
  cardRef: (el: HTMLAnchorElement | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLAnchorElement>) => void;
  onMoveTo: (to: EnquiryStatus) => void;
}) {
  const navigate = useNavigate();
  const final = FINAL.includes(row.status);
  const overdue = (row.status === 'New' || row.status === 'Quoting') && row.requiredBy < TODAY;
  const location = locationTextMulti(row.serviceCategories, row.origin, row.destination);
  const services = row.serviceCategories.map((c) => jobKindLabel(c, row.mode)).join(' + ');
  return (
    <article
      draggable={!final}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', row.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={clsx(
        'group relative rounded-lg border bg-surface p-3 shadow-card transition-shadow hover:shadow-card-hover',
        picked ? 'border-brand ring-2 ring-brand' : 'border-border-subtle',
        !final && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          ref={cardRef}
          draggable={false}
          to="/enquiries/$id"
          params={{ id: row.id }}
          onKeyDown={onKeyDown}
          aria-describedby={`card-meta-${row.id}`}
          aria-label={`${row.number}, ${row.customerName}, ${row.status}${picked ? ', picked up' : ''}`}
          className="min-w-0 rounded-sm after:absolute after:inset-0 after:content-['']"
        >
          <DocRef>{row.number}</DocRef>
          <span className="mt-0.5 block truncate text-body-s font-semibold text-fg">{row.customerName}</span>
        </Link>
        <span className="relative z-10 flex shrink-0 items-center gap-1">
          {!final ? (
            <GripVertical
              aria-hidden="true"
              className="size-4 text-fg-muted opacity-0 group-hover:opacity-100"
            />
          ) : null}
          <MoveMenu row={row} onMoveTo={onMoveTo} />
        </span>
      </div>
      <div id={`card-meta-${row.id}`} className="mt-2 space-y-1.5 text-caption text-fg-muted">
        <p className="flex items-center gap-1.5">
          <ServiceIcons categories={row.serviceCategories} mode={row.mode} className="size-3.5" />
          <span className="truncate">{services}</span>
        </p>
        {location ? <p className="truncate text-fg-secondary">{location}</p> : null}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span
            className={clsx(
              'inline-flex items-center gap-1 whitespace-nowrap',
              overdue && 'font-semibold text-danger',
            )}
          >
            <CalendarClock aria-hidden="true" className="size-3.5" />
            {overdue ? 'Overdue · ' : 'Needed '}
            {shortDate(row.requiredBy)}
          </span>
          <span className="flex items-center gap-1.5">
            {row.latestQuotation ? (
              <button
                type="button"
                onClick={() =>
                  void navigate({ to: '/quotations/$id', params: { id: row.latestQuotation!.id } })
                }
                className="relative z-10 inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border px-1.5 py-px font-mono text-[11px] text-fg-secondary hover:border-brand hover:text-brand"
                aria-label={`Open quotation ${row.latestQuotation.number}, ${row.latestQuotation.status}`}
              >
                <FileText aria-hidden="true" className="size-3" />
                {row.latestQuotation.number}
              </button>
            ) : null}
            <span title={row.owner}>
              <Avatar name={row.owner} size="sm" />
              <span className="sr-only">Owner {row.owner}</span>
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

function MoveMenu({ row, onMoveTo }: { row: EnquiryBoardRow; onMoveTo: (to: EnquiryStatus) => void }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Move ${row.number} to…`}
        onClick={() => setOpen(!open)}
        className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg"
      >
        <ArrowRightLeft aria-hidden="true" className="size-3.5" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-border-subtle bg-surface p-1 shadow-2xl"
        >
          <p className="px-2.5 py-1.5 text-caption text-fg-muted">Move to</p>
          {BOARD_COLUMNS.filter((s) => s !== row.status).map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onMoveTo(s);
              }}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-body-s hover:bg-surface-muted"
            >
              <StatusBadge status={s} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LostReasonDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: EnquiryBoardRow | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!row) return;
    // Reset when a new card is being closed as lost.
    const t = setTimeout(() => {
      setReason('');
      setTouched(false);
    }, 0);
    return () => clearTimeout(t);
  }, [row]);
  const error =
    touched && reason.trim().length < 3 ? 'Give a short reason (at least 3 characters)' : undefined;
  return (
    <Dialog
      open={!!row}
      onClose={onClose}
      title={row ? `Mark ${row.number} as lost` : 'Mark as lost'}
      description="Lost is final. The reason is saved on the enquiry for reporting."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setTouched(true);
              if (reason.trim().length >= 3) onConfirm(reason.trim());
            }}
          >
            Mark as lost
          </Button>
        </>
      }
    >
      <TextareaField
        label="Reason"
        required
        placeholder="e.g. Price too high, customer chose another forwarder"
        value={reason}
        error={error}
        onChange={(e) => setReason(e.target.value)}
      />
    </Dialog>
  );
}
