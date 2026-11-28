import { useQuery } from '@tanstack/react-query';
import type { ReasonKind } from '@/domain/types';
import { latency, protoDb, type ProtoDb } from '@/prototype/store';

/**
 * Option lists from the Masters (PROTOTYPE ADAPTER — backend contract API-DEP-47).
 * Every screen that offers a choice from a master uses these hooks, so a new entry in the
 * master appears everywhere at once. Only ACTIVE entries are offered.
 */
export type MasterKey =
  | 'serviceTypes'
  | 'unitsOfMeasure'
  | 'customerCategories'
  | 'vendorCategories'
  | 'places'
  | 'currencies'
  | 'taxCodes'
  | 'paymentTerms'
  | 'bankAccounts'
  | 'assetCategories'
  | 'reasonCodes';

export interface Option {
  value: string;
  label: string;
}

type Row = ProtoDb[MasterKey][number];

const optionOf = (key: MasterKey, r: Row): Option => {
  switch (key) {
    case 'unitsOfMeasure':
    case 'customerCategories':
    case 'places':
    case 'assetCategories':
    case 'reasonCodes':
      return { value: r.name, label: r.name };
    case 'currencies':
      return { value: r.code, label: `${r.code} · ${r.name}` };
    case 'paymentTerms':
      return { value: String((r as ProtoDb['paymentTerms'][number]).days), label: r.name };
    default:
      return { value: r.id, label: r.name };
  }
};

export function masterOptions(key: MasterKey, filter?: (r: Row) => boolean): Option[] {
  const rows = (protoDb.get()[key] as Row[]).filter((r) => r.active && (!filter || filter(r)));
  return rows.map((r) => optionOf(key, r));
}

export function useMasterOptions(key: MasterKey) {
  return useQuery({
    queryKey: ['masters', 'options', key],
    queryFn: () => latency(masterOptions(key), 40),
    staleTime: 30_000,
  });
}

export function useReasonOptions(kind: ReasonKind) {
  return useQuery({
    queryKey: ['masters', 'options', 'reasonCodes', kind],
    queryFn: () =>
      latency(
        masterOptions('reasonCodes', (r) => (r as ProtoDb['reasonCodes'][number]).kind === kind),
        40,
      ),
    staleTime: 30_000,
  });
}
