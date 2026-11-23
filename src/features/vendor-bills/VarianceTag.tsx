import { formatMoney } from '@/shared/utils/format';

/** Bill amount vs agreed job vendor cost. Text always states the meaning (not colour alone). */
export function VarianceTag({ variance }: { variance: number }) {
  if (Math.abs(variance) < 0.01)
    return <p className="text-caption font-medium text-success">Matches job cost</p>;
  return (
    <p className={`text-caption font-medium ${variance > 0 ? 'text-danger' : 'text-warning'}`}>
      {variance > 0 ? 'Over' : 'Under'} job cost by {formatMoney(Math.abs(variance))}
    </p>
  );
}
