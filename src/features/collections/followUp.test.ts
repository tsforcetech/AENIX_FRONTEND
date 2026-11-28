import { ageingBucket, creditHoldSuggestions, nextReminderLevel } from './followUp';

describe('collections follow-up', () => {
  it('buckets days past due', () => {
    expect(ageingBucket(0)).toBeUndefined();
    expect(ageingBucket(1)).toBe('1–30 days');
    expect(ageingBucket(31)).toBe('31–60 days');
    expect(ageingBucket(90)).toBe('61–90 days');
    expect(ageingBucket(91)).toBe('90+ days');
  });

  it('steps the reminder level up to 3', () => {
    expect(nextReminderLevel(undefined)).toBe(1);
    expect(nextReminderLevel([{ level: 1 }])).toBe(2);
    expect(nextReminderLevel([{ level: 1 }, { level: 3 }])).toBe(3);
  });

  it('suggests credit hold only beyond 30 days overdue', () => {
    const m = creditHoldSuggestions([
      { customerId: 'a', daysOverdue: 12, outstandingAed: 100 },
      { customerId: 'b', daysOverdue: 31, outstandingAed: 200 },
      { customerId: 'b', daysOverdue: 5, outstandingAed: 50 },
    ]);
    expect([...m.keys()]).toEqual(['b']);
    expect(m.get('b')).toEqual({ maxDays: 31, overdue: 250 });
  });
});
