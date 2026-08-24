import { Member, Contribution, Payment, Expense } from '../types';

/**
 * Checks if a specific obligation applies to a given member based on targeting rules
 */
export function isObligationApplicableToMember(contribution: Contribution, member: Member): boolean {
  if (!contribution) return false;

  // If specific members are targeted
  if (contribution.targetType === 'members') {
    return Array.isArray(contribution.targetMemberIds) && contribution.targetMemberIds.includes(member.id);
  }

  // If specific categories are targeted
  if (contribution.targetType === 'category') {
    return (
      Array.isArray(contribution.targetCategories) &&
      contribution.targetCategories.includes(member.category)
    );
  }

  // Default 'all' or untargeted applies to all members
  return true;
}

/**
 * Returns list of active members to whom this contribution applies
 */
export function getApplicableMembers(contribution: Contribution, members: Member[]): Member[] {
  return (members || []).filter(
    (m) => m.status === 'active' && isObligationApplicableToMember(contribution, m)
  );
}

/**
 * Financial logic and validation controls
 * Outstanding balance: max(0, expected - paid)
 */
export function calcOutstanding(expected: number, paid: number): number {
  if (!Number.isFinite(expected) || !Number.isFinite(paid)) return 0;
  return Math.max(0, expected - paid);
}

/**
 * Collection rate: If expected is zero: 0%; otherwise clamp(round(paid / expected * 100), 0, 100).
 */
export function calcCollectionRate(expected: number, paid: number): number {
  if (!expected || expected <= 0) return 0;
  const rate = Math.round(((paid || 0) / expected) * 100);
  return Math.min(100, Math.max(0, rate));
}

/**
 * Unallocated credit: max(0, payment amount - total allocations)
 */
export function calcUnallocatedCredit(paymentAmount: number, totalAllocated: number): number {
  return Math.max(0, (paymentAmount || 0) - (totalAllocated || 0));
}

/**
 * Contribution expected total: Amount * count of applicable active members; zero for free-will donation
 */
export function calcContributionExpected(
  contribution: Contribution,
  activeMembersOrCount: number | Member[]
): number {
  if (!contribution || contribution.type === 'donation') return 0;

  if (Array.isArray(activeMembersOrCount)) {
    const applicableCount = getApplicableMembers(contribution, activeMembersOrCount).length;
    return Math.max(0, (contribution.amount || 0) * applicableCount);
  }

  return Math.max(0, (contribution.amount || 0) * (activeMembersOrCount || 0));
}

/**
 * Contribution received total: Sum of allocations from CONFIRMED payments only
 */
export function calcContributionReceived(contributionId: string, payments: Payment[]): number {
  return (payments || [])
    .filter((p) => p.status === 'confirmed')
    .reduce((sum, p) => {
      return sum + (p.allocations || [])
        .filter((a) => a.contributionId === contributionId && Number.isFinite(a.amount))
        .reduce((allocationSum, a) => allocationSum + a.amount, 0);
    }, 0);
}

/**
 * Total Confirmed Inflows
 */
export function calcTotalConfirmedInflow(payments: Payment[]): number {
  return (payments || [])
    .filter((p) => p.status === 'confirmed')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
}

/**
 * Total Compulsory Assigned Expected
 */
export function calcTotalCompulsoryAssigned(members: Member[]): number {
  return (members || []).reduce((sum, m) => sum + (m.expectedBalance || 0), 0);
}

/**
 * Total Expenses
 */
export function calcTotalExpenses(expenses: Expense[]): number {
  return (expenses || [])
    .filter((e) => e.status !== 'voided')
    .reduce((sum, e) => sum + (e.amount || 0), 0);
}

/**
 * Calculate member's outstanding per contribution with applicability awareness
 */
export function getMemberContributionStatus(
  member: Member,
  contribution: Contribution,
  confirmedPayments: Payment[]
) {
  const isApplicable = isObligationApplicableToMember(contribution, member);
  const isDonation = contribution.type === 'donation';
  const expectedForThis = !isApplicable || isDonation ? 0 : contribution.amount;

  // sum allocations made by this member to this contribution in confirmed payments
  const paidForThis = (confirmedPayments || [])
    .filter((p) => p.memberId === member.id && p.status === 'confirmed')
    .reduce((sum, p) => {
      return sum + (p.allocations || [])
        .filter((a) => a.contributionId === contribution.id && Number.isFinite(a.amount))
        .reduce((allocationSum, a) => allocationSum + a.amount, 0);
    }, 0);

  const outstanding = Math.max(0, expectedForThis - paidForThis);
  
  let status: 'cleared' | 'partial' | 'unpaid' | 'donated' | 'exempt' = 'unpaid';
  if (!isApplicable && paidForThis === 0) {
    status = 'exempt';
  } else if (isDonation) {
    status = paidForThis > 0 ? 'donated' : 'unpaid';
  } else if (expectedForThis > 0 && paidForThis >= expectedForThis) {
    status = 'cleared';
  } else if (paidForThis > 0) {
    status = 'partial';
  } else if (expectedForThis === 0) {
    status = 'exempt';
  } else {
    status = 'unpaid';
  }

  return {
    isApplicable,
    expected: expectedForThis,
    paid: paidForThis,
    outstanding,
    status,
  };
}
