import type { ActivityEvent } from '@/domain/types';
import { activityCsv, filterActivity, formatChanges } from './audit';
import { csvCell, toCsv } from './csv';

const ev = (id: string, at: string, over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id,
  at,
  actor: 'Aisha Khan',
  entity: 'Invoice',
  entityId: `x-${id}`,
  entityRef: `INV-${id}`,
  action: 'posted',
  ...over,
});

const events = [
  ev('1', '2026-11-20T09:00:00Z'),
  ev('2', '2026-11-22T09:00:00Z', { actor: 'Rahul Nair', entity: 'Enquiry', action: 'logged' }),
  ev('3', '2026-11-21T09:00:00Z', {
    entity: 'Settings',
    entityRef: 'Company',
    action: 'changed settings',
    changes: [{ field: 'Numbering reset yearly', from: 'No', to: 'Yes' }],
  }),
];

describe('filterActivity', () => {
  it('returns newest first', () => {
    expect(filterActivity(events, {}).map((e) => e.id)).toEqual(['2', '3', '1']);
  });
  it('filters by entity, user, inclusive date range and text (incl. changes)', () => {
    expect(filterActivity(events, { entity: 'Invoice' }).map((e) => e.id)).toEqual(['1']);
    expect(filterActivity(events, { actor: 'Rahul Nair' }).map((e) => e.id)).toEqual(['2']);
    expect(filterActivity(events, { from: '2026-11-21', to: '2026-11-21' }).map((e) => e.id)).toEqual(['3']);
    expect(filterActivity(events, { q: 'numbering' }).map((e) => e.id)).toEqual(['3']);
  });
});

describe('audit CSV', () => {
  it('formats changes and escapes cells', () => {
    expect(formatChanges(events[2]!)).toBe('Numbering reset yearly: No → Yes');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(toCsv(['A', 'B'], [[1, undefined]])).toBe('A,B\r\n1,');
    const csv = activityCsv(events);
    expect(csv.split('\r\n')).toHaveLength(4);
    expect(csv).toContain('Numbering reset yearly: No → Yes');
  });
});
