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
  try {
    const userRef = doc(db, 'users', user.id);
    await setDoc(userRef, cleanForFirestore({
      ...user,
      currentOrgId: currentOrgId || null,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
  } catch (err) {
    console.error('Firestore operation failed:', err); throw err;
  }
}

// Organizations
export async function saveOrganizationDoc(org: Organization) {
  try {
    const orgRef = doc(db, 'organizations', org.id);
    await setDoc(orgRef, cleanForFirestore(org), { merge: true });
  } catch (err) {
    console.error('Firestore operation failed:', err); throw err;
  }
}

// Org Memberships
export async function saveMembershipDoc(mship: OrgMembership) {
  try {
    const mshipRef = doc(db, 'org_memberships', mship.id);
    await setDoc(mshipRef, cleanForFirestore(mship), { merge: true });
  } catch (err) {
    console.error('Firestore operation failed:', err); throw err;
  }
}

export async function deleteMembershipDoc(membershipId: string) {
  try {
    const mshipRef = doc(db, 'org_memberships', membershipId);
    await deleteDoc(mshipRef);
  } catch (err) {
    console.warn('Firestore deleteMembershipDoc warning:', err);
  }
}

// Members
export async function saveMemberDoc(member: Member) {
  try {
    const memberRef = doc(db, 'members', member.id);
    await setDoc(memberRef, cleanForFirestore(member), { merge: true });
  } catch (err) {
    console.error('Firestore operation failed:', err); throw err;
  }
}

export async function deleteMemberDoc(memberId: string) {
  try {
    const memberRef = doc(db, 'members', memberId);
    await deleteDoc(memberRef);
  } catch (err) {
    console.warn('Firestore deleteMemberDoc warning:', err);
  }
}

// Contributions / Dues
export async function saveContributionDoc(contribution: Contribution) {
  try {
    const contribRef = doc(db, 'contributions', contribution.id);
    await setDoc(contribRef, cleanForFirestore(contribution), { merge: true });
  } catch (err) {
    console.error('Firestore operation failed:', err); throw err;
  }
}

export async function deleteContributionDoc(contribId: string) {
  try {
    const contribRef = doc(db, 'contributions', contribId);
    await deleteDoc(contribRef);
  } catch (err) {
    console.warn('Firestore deleteContributionDoc warning:', err);
  }
}

// Payments
export async function savePaymentDoc(payment: Payment) {
  try {
    const payRef = doc(db, 'payments', payment.id);
    await setDoc(payRef, cleanForFirestore(payment), { merge: true });
  } catch (err) {
    console.error('Firestore operation failed:', err); throw err;
  }
}

// Expenses
export async function saveExpenseDoc(expense: Expense) {
  try {
    const expRef = doc(db, 'expenses', expense.id);
    await setDoc(expRef, cleanForFirestore(expense), { merge: true });
  } catch (err) {
    console.error('Firestore operation failed:', err); throw err;
  }
}

export async function deleteExpenseDoc(expenseId: string) {
  try {
    const expRef = doc(db, 'expenses', expenseId);
    await deleteDoc(expRef);
  } catch (err) {
    console.warn('Firestore deleteExpenseDoc warning:', err);
  }
}

// Audit Events
export async function saveAuditEventDoc(event: AuditEvent) {
  try {
    const audRef = doc(db, 'audit_events', event.id);
    await setDoc(audRef, cleanForFirestore(event), { merge: true });
  } catch (err) {
    console.error('Firestore operation failed:', err); throw err;
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

