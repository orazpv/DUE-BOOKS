import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './firestoreErrors';
import {
  Organization,
  OrgMembership,
  Member,
  Contribution,
  Payment,
  Expense,
  AuditEvent,
  User,
} from '../types';

/**
 * Strips undefined values to satisfy Firestore payload constraints
 */
export function cleanForFirestore<T extends Record<string, any>>(obj: T): T {
  const cleaned: any = {};
  Object.keys(obj).forEach((key) => {
    const val = obj[key];
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        cleaned[key] = cleanForFirestore(val);
      } else {
        cleaned[key] = val;
      }
    }
  });
  return cleaned;
}

// User Document
export async function saveUserDoc(user: User, currentOrgId?: string) {
  const path = `users/${user.id}`;
  try {
    const userRef = doc(db, 'users', user.id);
    await setDoc(userRef, cleanForFirestore({
      ...user,
      currentOrgId: currentOrgId || null,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Organizations
export async function saveOrganizationDoc(org: Organization) {
  const path = `organizations/${org.id}`;
  try {
    const orgRef = doc(db, 'organizations', org.id);
    await setDoc(orgRef, cleanForFirestore(org), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Org Memberships
export async function saveMembershipDoc(mship: OrgMembership) {
  const path = `org_memberships/${mship.id}`;
  try {
    const mshipRef = doc(db, 'org_memberships', mship.id);
    await setDoc(mshipRef, cleanForFirestore(mship), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteMembershipDoc(membershipId: string) {
  const path = `org_memberships/${membershipId}`;
  try {
    const mshipRef = doc(db, 'org_memberships', membershipId);
    await deleteDoc(mshipRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Members
export async function saveMemberDoc(member: Member) {
  const path = `members/${member.id}`;
  try {
    const memberRef = doc(db, 'members', member.id);
    await setDoc(memberRef, cleanForFirestore(member), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteMemberDoc(memberId: string) {
  const path = `members/${memberId}`;
  try {
    const memberRef = doc(db, 'members', memberId);
    await deleteDoc(memberRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Contributions / Dues
export async function saveContributionDoc(contribution: Contribution) {
  const path = `contributions/${contribution.id}`;
  try {
    const contribRef = doc(db, 'contributions', contribution.id);
    await setDoc(contribRef, cleanForFirestore(contribution), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteContributionDoc(contribId: string) {
  const path = `contributions/${contribId}`;
  try {
    const contribRef = doc(db, 'contributions', contribId);
    await deleteDoc(contribRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Payments
export async function savePaymentDoc(payment: Payment) {
  const path = `payments/${payment.id}`;
  try {
    const payRef = doc(db, 'payments', payment.id);
    await setDoc(payRef, cleanForFirestore(payment), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Expenses
export async function saveExpenseDoc(expense: Expense) {
  const path = `expenses/${expense.id}`;
  try {
    const expRef = doc(db, 'expenses', expense.id);
    await setDoc(expRef, cleanForFirestore(expense), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteExpenseDoc(expenseId: string) {
  const path = `expenses/${expenseId}`;
  try {
    const expRef = doc(db, 'expenses', expenseId);
    await deleteDoc(expRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Audit Events
export async function saveAuditEventDoc(event: AuditEvent) {
  const path = `audit_events/${event.id}`;
  try {
    const audRef = doc(db, 'audit_events', event.id);
    await setDoc(audRef, cleanForFirestore(event), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Safely purge test or operational records (members, contributions, payments, expenses)
 * for a specific organization in Firestore while leaving the Organization metadata,
 * User profiles, and Org Memberships / Officer roles 100% intact.
 */
export async function deleteOrganizationDoc(orgId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Delete all sub-records (members, contributions, payments, expenses, audit events)
    await clearOrgFirestoreCollections(orgId);

    // 2. Delete all memberships associated with this org
    const mshipRef = collection(db, 'org_memberships');
    const qMship = query(mshipRef, where('orgId', '==', orgId));
    const snapMship = await getDocs(qMship);
    if (!snapMship.empty) {
      let batch = writeBatch(db);
      for (const d of snapMship.docs) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }

    // 3. Delete the organization doc itself
    const orgRef = doc(db, 'organizations', orgId);
    await deleteDoc(orgRef);

    return { success: true };
  } catch (err: any) {
    console.error('Error in deleteOrganizationDoc:', err);
    return { success: false, error: err?.message || 'Failed to delete organization from Firestore.' };
  }
}

export async function clearOrgFirestoreCollections(orgId: string): Promise<{ success: boolean; count: number; error?: string }> {
  if (!orgId) {
    return { success: false, count: 0, error: 'No organization ID provided.' };
  }

  const collectionsToPurge = ['members', 'contributions', 'payments', 'expenses', 'audit_events'];
  let totalDeleted = 0;

  try {
    for (const colName of collectionsToPurge) {
      const colRef = collection(db, colName);
      const q = query(colRef, where('orgId', '==', orgId));
      const snap = await getDocs(q);

      if (!snap.empty) {
        let batch = writeBatch(db);
        let batchCount = 0;

        for (const docSnapshot of snap.docs) {
          batch.delete(docSnapshot.ref);
          batchCount++;
          totalDeleted++;

          if (batchCount % 400 === 0) {
            await batch.commit();
            batch = writeBatch(db);
          }
        }

        if (batchCount % 400 !== 0) {
          await batch.commit();
        }
      }
    }

    return { success: true, count: totalDeleted };
  } catch (err: any) {
    console.error('Error in clearOrgFirestoreCollections:', err);
    return { success: false, count: totalDeleted, error: err?.message || 'Failed to purge records from Firestore.' };
  }
}

