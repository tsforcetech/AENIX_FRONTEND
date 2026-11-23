import { paginate } from './paging';

const rows = Array.from({ length: 25 }, (_, i) => ({
  id: i,
  name: `Row ${i}`,
  status: i % 2 ? 'Odd' : 'Even',
}));
const opts = {
  searchText: (r: (typeof rows)[number]) => r.name,
  status: (r: (typeof rows)[number]) => r.status,
};

describe('paginate', () => {
  it('pages, counts and filters by status', () => {
    const p = paginate(rows, { page: 2, pageSize: 10, status: 'Odd' }, opts);
    expect(p.total).toBe(12);
    expect(p.items).toHaveLength(2);
    expect(p.counts).toMatchObject({ All: 25, Odd: 12, Even: 13 });
  });

  it('caps page size at 100 and searches case-insensitively', () => {
    expect(paginate(rows, { pageSize: 5000 }, opts).pageSize).toBe(100);
    expect(paginate(rows, { search: 'ROW 2' }, opts).total).toBe(6); // Row 2, Row 20–24
  });
});
