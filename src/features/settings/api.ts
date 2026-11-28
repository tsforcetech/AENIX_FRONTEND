import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApprovalRule, CompanyProfile } from '@/domain/types';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, protoDb } from '@/prototype/store';
import { exampleNumber, ruleChanges, systemChanges, validateRules } from './system';

/**
 * Settings mock adapter (prototype). Company settings, approval matrix and module switches are
 * REQUESTED contracts; the backend owns the real values and who may change them.
 */
export interface SettingsData {
  company: CompanyProfile;
  approvalRules: ApprovalRule[];
  /** Next invoice number under each numbering scheme, for the example text. */
  numberExamples: { running: string; yearly: string };
}

function build(): SettingsData {
  const db = protoDb.get();
  const numbers = db.invoices.map((i) => i.number);
  const year = Number(PROTO_TODAY.slice(0, 4));
  return {
    company: db.company,
    approvalRules: db.approvalRules,
    numberExamples: {
      running: exampleNumber(db.company.invoicePrefix, false, year, numbers),
      yearly: exampleNumber(db.company.invoicePrefix, true, year, numbers),
    },
  };
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => latency(build()) });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  // Company switches and rules influence many screens (numbering, modules, approvals).
  void qc.invalidateQueries();
}

export function useSaveCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: CompanyProfile) => {
      protoDb.update((db) => ({
        ...db,
        company: {
          ...db.company,
          ...draft,
          // Only profile fields come from this form; system switches are saved separately.
          numberingResetYearly: db.company.numberingResetYearly,
          lockedUntil: db.company.lockedUntil,
          modules: db.company.modules,
          notificationChannels: db.company.notificationChannels,
          officeAddress: draft.officeAddress.filter(Boolean),
          registeredAddress: draft.registeredAddress.filter(Boolean),
        },
      }));
      logActivity({
        entity: 'Settings',
        entityId: 'company',
        entityRef: 'Company profile',
        action: 'updated the company profile',
      });
      return latency(undefined, 200);
    },
    onSuccess: () => invalidate(qc),
  });
}

/** X4 / scope switches / X7. `lockedUntil` is NOT editable here (period close owns it). */
export function useSaveSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Pick<CompanyProfile, 'numberingResetYearly' | 'modules' | 'notificationChannels'>,
    ) => {
      const before = protoDb.get().company;
      const after: CompanyProfile = { ...before, ...input };
      const changes = systemChanges(before, after);
      if (changes.length === 0) return latency(0, 120);
      protoDb.update((db) => ({ ...db, company: after }));
      logActivity({
        entity: 'Settings',
        entityId: 'company-system',
        entityRef: 'Company & system',
        action: 'changed system settings',
        changes,
      });
      return latency(changes.length, 200);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useSaveApprovalRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rules: ApprovalRule[]) => {
      const errors = validateRules(rules);
      if (Object.keys(errors).length) throw new Error('Fix the highlighted rules before saving.');
      const before = protoDb.get().approvalRules;
      const changes = ruleChanges(before, rules);
      if (changes.length === 0) return latency(0, 120);
      protoDb.update((db) => ({ ...db, approvalRules: rules }));
      logActivity({
        entity: 'Settings',
        entityId: 'approval-matrix',
        entityRef: 'Approval matrix',
        action: 'changed the approval matrix',
        changes,
      });
      return latency(changes.length, 200);
    },
    onSuccess: () => invalidate(qc),
  });
}
