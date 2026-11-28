import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decideApproval } from '@/shared/data/approvals';
import { latency, protoDb } from '@/prototype/store';
import { buildInbox, type ApprovalFilter } from './inbox';

/**
 * X2 approvals inbox. PROTOTYPE ADAPTER over the shared approval service
 * (backend contract API-DEP-31 pending). The backend decides who may approve.
 */
export function useApprovalInbox(filter: ApprovalFilter) {
  return useQuery({
    queryKey: ['approvals', 'inbox', filter],
    queryFn: () => latency(buildInbox(protoDb.get().approvalRequests, filter)),
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; decision: 'Approved' | 'Rejected'; reason?: string }) => {
      const decided = decideApproval(input.id, input.decision, input.reason?.trim() || undefined);
      return latency(decided, 200);
    },
    // The owning module's handler may have changed any document: refresh everything.
    onSettled: () => void qc.invalidateQueries(),
  });
}
