import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  Organization,
  OrgMembership,
  OrgBranding,
  Member,
  Contribution,
  Payment,
  Expense,
  AuditEvent,
  User,
  Role,
  PaymentMethod,
  PaymentAllocation,
  BankAccount,
  Custodian,
} from '../types';
import { applyBrandTheme, DEFAULT_BRAND_COLOR } from '../utils/branding';
import {
  CURRENT_USER,
  MOCK_USERS,
  INITIAL_ORGANIZATIONS,
  INITIAL_MEMBERSHIPS,
  INITIAL_MEMBERS,
  INITIAL_CONTRIBUTIONS,
  INITIAL_PAYMENTS,
  INITIAL_EXPENSES,
  INITIAL_AUDIT_EVENTS,
} from '../data/initialData';
import { calcOutstanding, isObligationApplicableToMember } from '../utils/financial';
import { isValidIsoDate, normalizeWholeNaira } from '../utils/validation';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from 'firebase/firestore';
import {
  saveUserDoc,
  saveOrganizationDoc,
  saveMembershipDoc,
  deleteMembershipDoc,
  saveMemberDoc,
  deleteMemberDoc,
  saveContributionDoc,
  deleteContributionDoc,
  savePaymentDoc,
  saveExpenseDoc,
  deleteExpenseDoc,
  saveAuditEventDoc,
  deleteOrganizationDoc,
  clearOrgFirestoreCollections,
} from '../lib/firestoreService';

interface DuesBookContextType {
  // Auth & Session
  firebaseUser: FirebaseUser | null;
  authLoading: boolean;
  logout: () => Promise<void>;
  loginAsDemoUser: (email: string, name: string) => void;
  syncStatus: 'synced' | 'syncing' | 'offline';

  // User & Roles
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
  availableUsers: User[];
  currentRole: Role;
  effectiveRole: Role;
  simulatedRole: Role | null;
  setSimulatedRole: (role: Role | null) => void;
  canMutate: boolean;
  canManageOfficers: boolean;

  // Organizations & Onboarding
  organizations: Organization[];
  currentOrgId: string;
  currentOrg: Organization | undefined;
  setCurrentOrgId: (id: string) => void;
  createOrganization: (data: {
    name: string;
    type: Organization['type'];
    motto?: string;
    currency?: string;
    code?: string;
    bankName?: string;
    accountNumber?: string;
  }) => Organization;
  updateOrganization: (id: string, data: Partial<Organization>) => void;
  deleteOrganization: (id: string) => Promise<{ success: boolean; message: string }>;
  updateOrgBranding: (branding: Partial<OrgBranding>) => void;
  addBankAccount: (bank: Omit<BankAccount, 'id'>) => void;
  addCustodian: (custodian: Omit<Custodian, 'id'>) => void;
  isNewUserOnboarding: boolean;
  completeOnboarding: () => void;

  // Officers
  memberships: OrgMembership[];
  currentOrgMemberships: OrgMembership[];
  addOfficer: (data: { userEmail: string; userName: string; role: Role }) => { success: boolean; message: string };
  elevateMemberToOfficer: (memberId: string, role: Role, customEmail?: string) => { success: boolean; message: string };
  updateOfficerRole: (membershipId: string, newRole: Role) => { success: boolean; message: string };
  removeOfficer: (membershipId: string) => { success: boolean; message: string };

  // Members
  members: Member[];
  currentOrgMembers: Member[];
  addMember: (data: Omit<Member, 'id' | 'orgId' | 'expectedBalance' | 'paidBalance' | 'unallocatedCredit' | 'createdAt'>) => Member;
  updateMember: (id: string, data: Partial<Member>) => void;
  safeDeleteMember: (id: string) => { action: 'deleted' | 'archived'; message: string };
  restoreMember: (id: string) => void;

  // Contributions
  contributions: Contribution[];
  currentOrgContributions: Contribution[];
  addContribution: (data: Omit<Contribution, 'id' | 'orgId' | 'createdAt' | 'status'>) => Contribution;
  updateContribution: (id: string, data: Partial<Contribution>) => void;
  safeDeleteContribution: (id: string) => { action: 'deleted' | 'archived'; message: string };
  restoreContribution: (id: string) => void;

  // Payments
  payments: Payment[];
  currentOrgPayments: Payment[];
  recordPayment: (data: {
    memberId: string;
    amount: number;
    method: PaymentMethod;
    paymentDate: string;
    referenceNote?: string;
    channelDetails?: string;
    allocations: PaymentAllocation[];
  }) => { success: boolean; payment?: Payment; message?: string };
  reversePayment: (paymentId: string, reason: string) => { success: boolean; message: string };

  // Expenses & Treasury
  expenses: Expense[];
  currentOrgExpenses: Expense[];
  addExpense: (data: Omit<Expense, 'id' | 'orgId' | 'createdAt' | 'recordedByEmail' | 'recordedByName'>) => Expense;
  deleteExpense: (id: string) => void;

  // Audit Events
  auditEvents: AuditEvent[];
  currentOrgAuditEvents: AuditEvent[];

  // Utility
  resetToDemoData: () => Promise<void>;
  clearAllData: () => Promise<void>;
  purgeOrganizationData: (orgId?: string) => Promise<{ success: boolean; message: string; count?: number }>;
}

const STORAGE_KEY = 'dues_book_v7_store';

const DuesBookContext = createContext<DuesBookContextType | null>(null);

export const DuesBookProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('synced');

  // Active App User - null when signed out
  const [currentUser, setCurrentUserState] = useState<User | null>(null);

  const [simulatedRole, setSimulatedRole] = useState<Role | null>(null);

  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [currentOrgId, setCurrentOrgIdState] = useState<string>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_currentOrgId`);
    return saved || '';
  });

  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  // Local storage persistence
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(`${STORAGE_KEY}_user`);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentOrgId) {
      localStorage.setItem(`${STORAGE_KEY}_currentOrgId`, currentOrgId);
    } else {
      localStorage.removeItem(`${STORAGE_KEY}_currentOrgId`);
    }
  }, [currentOrgId]);

  // Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const mappedUser: User = {
          id: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'Officer',
          email: user.email || 'user@duesbook.app',
        };
        setCurrentUserState(mappedUser);
        if (currentOrgId) {
          await saveUserDoc(mappedUser, currentOrgId);
        }
      } else {
        setCurrentUserState(null);
        localStorage.removeItem(`${STORAGE_KEY}_user`);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [currentOrgId]);

  // Load only memberships tied to the authenticated Firebase UID.
  useEffect(() => {
    if (!firebaseUser) return;
    setSyncStatus('syncing');
    const ownMemberships = query(
      collection(db, 'org_memberships'),
      where('userId', '==', firebaseUser.uid),
      where('status', '==', 'active')
    );
    return onSnapshot(ownMemberships, async (snapshot) => {
      const loaded = snapshot.docs.map((d) => d.data() as OrgMembership);
      setMemberships(loaded);
      const orgDocs = await Promise.all(
        loaded.map((m) => getDoc(doc(db, 'organizations', m.orgId)))
      );
      const accessible = orgDocs.filter((d) => d.exists()).map((d) => d.data() as Organization);
      setOrganizations(accessible);
      if (!currentOrgId && accessible[0]) setCurrentOrgIdState(accessible[0].id);
      setSyncStatus('synced');
    }, (err) => {
      console.warn('Authorized memberships listener:', err);
      setSyncStatus('offline');
    });
  }, [firebaseUser]);

  // Operational listeners are always constrained to the selected authorized organization.
  useEffect(() => {
    if (!firebaseUser || !currentOrgId) return;
    const ownMembership = memberships.find(
      (m) => m.orgId === currentOrgId && m.userId === firebaseUser.uid && m.status === 'active'
    );
    if (!ownMembership) return;
    const scoped = <T,>(name: string, setter: React.Dispatch<React.SetStateAction<T[]>>) =>
      onSnapshot(query(collection(db, name), where('orgId', '==', currentOrgId)), (snapshot) => {
        setter(snapshot.docs.map((d) => d.data() as T));
      }, (err) => {
        console.warn(`${name} listener:`, err);
        setSyncStatus('offline');
      });
    const unsubs = [
      scoped<OrgMembership>('org_memberships', setMemberships),
      scoped<Member>('members', setMembers),
      scoped<Contribution>('contributions', setContributions),
      scoped<Payment>('payments', setPayments),
      scoped<Expense>('expenses', setExpenses),
      scoped<AuditEvent>('audit_events', setAuditEvents),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [firebaseUser, currentOrgId, memberships.some((m) => m.orgId === currentOrgId && m.userId === firebaseUser?.uid)]);

  // Derived current org
  const currentOrg = useMemo(() => {
    return organizations.find((o) => o.id === currentOrgId) || organizations[0];
  }, [organizations, currentOrgId]);

  // Synchronize dynamic brand color theme to document root CSS variables
  useEffect(() => {
    const brandColor = currentOrg?.branding?.primaryColor || DEFAULT_BRAND_COLOR;
    applyBrandTheme(brandColor);
  }, [currentOrg?.branding?.primaryColor, currentOrgId]);

  // Filtered by current org
  const currentOrgMemberships = useMemo(() => {
    return memberships.filter((m) => m.orgId === currentOrgId);
  }, [memberships, currentOrgId]);

  const currentOrgMembers = useMemo(() => {
    return members.filter((m) => m.orgId === currentOrgId);
  }, [members, currentOrgId]);

  const currentOrgContributions = useMemo(() => {
    return contributions.filter((c) => c.orgId === currentOrgId);
  }, [contributions, currentOrgId]);

  const currentOrgPayments = useMemo(() => {
    return payments.filter((p) => p.orgId === currentOrgId);
  }, [payments, currentOrgId]);

  const currentOrgExpenses = useMemo(() => {
    return expenses.filter((e) => e.orgId === currentOrgId);
  }, [expenses, currentOrgId]);

  const currentOrgAuditEvents = useMemo(() => {
    return auditEvents
      .filter((a) => a.orgId === currentOrgId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [auditEvents, currentOrgId]);

  // Determine current user's actual role in current organization
  const currentRole: Role = useMemo(() => {
    if (!currentUser?.email || !firebaseUser) return 'viewer';
    const m = currentOrgMemberships.find(
      (m) => m.userId === firebaseUser.uid && m.status === 'active'
    );
    return m ? m.role : 'viewer';
  }, [currentOrgMemberships, currentUser?.email, firebaseUser]);

  const effectiveRole: Role = currentRole;
  const canMutate =
    effectiveRole === 'admin' ||
    effectiveRole === 'treasurer' ||
    effectiveRole === 'financial_sec';
  const canManageOfficers = effectiveRole === 'admin';

  // Check if a new user has no organizations
  const isNewUserOnboarding = useMemo(() => {
    if (!firebaseUser) return false;
    return organizations.length === 0;
  }, [firebaseUser, organizations.length]);

  const completeOnboarding = () => {
    // Handled when org is created
  };

  const logAudit = async (
    event: Omit<AuditEvent, 'id' | 'orgId' | 'actorEmail' | 'actorName' | 'actorRole' | 'timestamp'>,
    targetOrgId: string = currentOrgId
  ) => {
    const newEvent: AuditEvent = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: targetOrgId,
      actorEmail: currentUser?.email || 'system@duesbook.app',
      actorName: currentUser?.name || 'Officer',
      actorRole: effectiveRole,
      timestamp: new Date().toISOString(),
      ...event,
    };
    setAuditEvents((prev) => [newEvent, ...prev]);
    await saveAuditEventDoc(newEvent);
  };

  // Switch Org
  const setCurrentOrgId = (id: string) => {
    setCurrentOrgIdState(id);
    setSimulatedRole(null);
    if (currentUser) {
      saveUserDoc(currentUser, id);
    }
  };

  // Switch User
  const setCurrentUser = (user: User) => {
    setCurrentUserState(user);
    setSimulatedRole(null);
  };

  // Logout
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
    setFirebaseUser(null);
    setCurrentUserState(null);
    setSimulatedRole(null);
    setOrganizations([]);
    setMembers([]);
    setContributions([]);
    setPayments([]);
    setExpenses([]);
    setAuditEvents([]);
    setMemberships([]);
    setCurrentOrgIdState('');

    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(STORAGE_KEY)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('LocalStorage clear warning:', e);
    }
  };

  // Demo user login helper
  const loginAsDemoUser = (demoEmail: string, demoName: string) => {
    const mapped: User = {
      id: `usr_${Date.now()}`,
      name: demoName,
      email: demoEmail,
    };
    setCurrentUserState(mapped);
    if (currentOrgId) {
      saveUserDoc(mapped, currentOrgId);
    }
  };

  // 1. Create Organization (Onboarding / Fresh start)
  const createOrganization = (data: {
    name: string;
    type: Organization['type'];
    motto?: string;
    currency?: string;
    code?: string;
    bankName?: string;
    accountNumber?: string;
  }): Organization => {
    if (!firebaseUser || !currentUser) {
      throw new Error('A verified Firebase account is required to create an organization.');
    }
    const newOrgId = `org_${crypto.randomUUID()}`;
    const code = data.code || data.name.substring(0, 4).toUpperCase();
    const userName = currentUser?.name || 'Administrator';
    const userEmail = currentUser?.email || 'admin@duesbook.app';

    const newOrg: Organization = {
      id: newOrgId,
      name: data.name,
      type: data.type,
      motto: data.motto || 'Every naira has a history.',
      currency: data.currency || 'NGN',
      currencySymbol: '₦',
      code: code,
      createdAt: new Date().toISOString(),
      ownerUid: firebaseUser.uid,
      bankAccounts: data.bankName && data.accountNumber ? [{
        id: `bank_${crypto.randomUUID()}`,
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        accountName: `${data.name} Main Account`,
        initialBalance: 0,
      }] : [],
      custodians: [
        {
          id: `cust_${Date.now()}`,
          name: userName,
          role: 'Executive Administrator / Custodian',
          phone: '',
        },
      ],
    };

    const newMembership: OrgMembership = {
      id: `${newOrgId}_${firebaseUser.uid}`,
      orgId: newOrgId,
      userEmail: userEmail,
      userId: firebaseUser.uid,
      userName: userName,
      role: 'admin',
      status: 'active',
      addedAt: new Date().toISOString(),
    };

    setOrganizations((prev) => [...prev, newOrg]);
    setMemberships((prev) => [...prev, newMembership]);
    setCurrentOrgIdState(newOrgId);

    // Save to Firestore
    saveOrganizationDoc(newOrg)
      .then(() => saveMembershipDoc(newMembership))
      .then(() => saveUserDoc(currentUser, newOrgId))
      .then(() => logAudit({
        action: 'ORGANIZATION_CREATED',
        entityType: 'organization',
        entityId: newOrgId,
        summary: `Organization "${newOrg.name}" initialized with Administrator ${userName}.`,
      }, newOrgId))
      .catch((err) => console.error('Organization initialization failed:', err));

    return newOrg;
  };

  const updateOrganization = (id: string, data: Partial<Organization>) => {
    if (!canManageOfficers) return;
    setOrganizations((prev) => {
      const updated = prev.map((o) => (o.id === id ? { ...o, ...data } : o));
      const target = updated.find((o) => o.id === id);
      if (target) saveOrganizationDoc(target);
      return updated;
    });

    logAudit({
      action: 'ORGANIZATION_UPDATED',
      entityType: 'organization',
      entityId: id,
      summary: `Updated organization details for ${data.name || 'organization'}.`,
    });
  };

  const updateOrgBranding = (branding: Partial<OrgBranding>) => {
    if (!canManageOfficers) return;
    setOrganizations((prev) => {
      const updated = prev.map((o) =>
        o.id === currentOrgId
          ? {
              ...o,
              branding: {
                ...(o.branding || {}),
                ...branding,
              },
            }
          : o
      );
      const target = updated.find((o) => o.id === currentOrgId);
      if (target) saveOrganizationDoc(target);
      return updated;
    });

    logAudit({
      action: 'ORGANIZATION_UPDATED',
      entityType: 'organization',
      entityId: currentOrgId,
      summary: `Updated branding configuration (logo/motto/headers) for ${currentOrg?.name || 'organization'}.`,
      payload: branding,
    });
  };

  const deleteOrganization = async (id: string): Promise<{ success: boolean; message: string }> => {
    if (effectiveRole !== 'admin') {
      return { success: false, message: 'Permission denied: Only an Administrator can delete an organization.' };
    }

    const targetOrg = organizations.find((o) => o.id === id);
    if (!targetOrg) {
      return { success: false, message: 'Organization not found.' };
    }

    setSyncStatus('syncing');

    try {
      // 1. Delete from Firestore (all subcollections and org doc)
      await deleteOrganizationDoc(id);

      // 2. Remove all related state
      const remainingOrgs = organizations.filter((o) => o.id !== id);
      setOrganizations(remainingOrgs);
      setMembers((prev) => prev.filter((m) => m.orgId !== id));
      setContributions((prev) => prev.filter((c) => c.orgId !== id));
      setPayments((prev) => prev.filter((p) => p.orgId !== id));
      setExpenses((prev) => prev.filter((e) => e.orgId !== id));
      setMemberships((prev) => prev.filter((m) => m.orgId !== id));
      setAuditEvents((prev) => prev.filter((a) => a.orgId !== id));

      // 3. Switch active org to first remaining, or empty if none
      const nextOrgId = remainingOrgs.length > 0 ? remainingOrgs[0].id : '';
      setCurrentOrgIdState(nextOrgId);
      if (currentUser && nextOrgId) {
        saveUserDoc(currentUser, nextOrgId);
      }

      setSyncStatus('synced');
      return {
        success: true,
        message: `Organization "${targetOrg.name}" and all associated data deleted successfully.`,
      };
    } catch (err: any) {
      setSyncStatus('synced');
      return {
        success: false,
        message: err?.message || 'Failed to delete organization.',
      };
    }
  };

  const addBankAccount = (bank: Omit<BankAccount, 'id'>) => {
    if (!canMutate) return;
    const newBank: BankAccount = {
      ...bank,
      id: `bank_${Date.now()}`,
    };
    setOrganizations((prev) => {
      const updated = prev.map((o) =>
        o.id === currentOrgId
          ? { ...o, bankAccounts: [...o.bankAccounts, newBank] }
          : o
      );
      const target = updated.find((o) => o.id === currentOrgId);
      if (target) saveOrganizationDoc(target);
      return updated;
    });

    logAudit({
      action: 'ORGANIZATION_CREATED',
      entityType: 'organization',
      entityId: currentOrgId,
      summary: `Added bank account: ${bank.bankName} (${bank.accountNumber}).`,
    });
  };

  const addCustodian = (custodian: Omit<Custodian, 'id'>) => {
    if (!canMutate) return;
    const newCust: Custodian = {
      ...custodian,
      id: `cust_${Date.now()}`,
    };
    setOrganizations((prev) => {
      const updated = prev.map((o) =>
        o.id === currentOrgId
          ? { ...o, custodians: [...o.custodians, newCust] }
          : o
      );
      const target = updated.find((o) => o.id === currentOrgId);
      if (target) saveOrganizationDoc(target);
      return updated;
    });

    logAudit({
      action: 'ORGANIZATION_CREATED',
      entityType: 'organization',
      entityId: currentOrgId,
      summary: `Added cash custodian: ${custodian.name} (${custodian.role}).`,
    });
  };

  // 2. Member operations
  const addMember = (
    data: Omit<Member, 'id' | 'orgId' | 'expectedBalance' | 'paidBalance' | 'unallocatedCredit' | 'createdAt'>
  ): Member => {
    if (!canMutate) throw new Error('You do not have permission to add members.');
    const activeObligations = currentOrgContributions.filter(
      (c) =>
        c.status === 'active' &&
        c.type !== 'donation' &&
        isObligationApplicableToMember(c, data as Member)
    );
    const initialExpected = activeObligations.reduce((sum, c) => sum + (c.amount || 0), 0);

    const newMember: Member = {
      ...data,
      id: `mbr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: currentOrgId,
      expectedBalance: initialExpected,
      paidBalance: 0,
      unallocatedCredit: 0,
      createdAt: new Date().toISOString(),
    };

    setMembers((prev) => [...prev, newMember]);
    saveMemberDoc(newMember);

    logAudit({
      action: 'MEMBER_CREATED',
      entityType: 'member',
      entityId: newMember.id,
      summary: `Enrolled new member ${newMember.fullName} (${newMember.memberNumber}) with initial assigned obligations ${initialExpected}.`,
      payload: { memberNumber: newMember.memberNumber, fullName: newMember.fullName },
    });

    return newMember;
  };

  const updateMember = (id: string, data: Partial<Member>) => {
    if (!canMutate) return;
    setMembers((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, ...data } : m));
      const target = updated.find((m) => m.id === id);
      if (target) saveMemberDoc(target);
      return updated;
    });

    logAudit({
      action: 'MEMBER_UPDATED',
      entityType: 'member',
      entityId: id,
      summary: `Updated member profile for ID: ${id}.`,
    });
  };

  const safeDeleteMember = (id: string): { action: 'deleted' | 'archived'; message: string } => {
    if (!canMutate) return { action: 'archived', message: 'Unauthorized' };
    const member = members.find((m) => m.id === id);
    if (!member) return { action: 'archived', message: 'Member not found' };

    const hasFinancialHistory = payments.some((p) => p.memberId === id);

    if (hasFinancialHistory) {
      setMembers((prev) => {
        const updated = prev.map((m) => (m.id === id ? { ...m, status: 'archived' as const } : m));
        const target = updated.find((m) => m.id === id);
        if (target) saveMemberDoc(target);
        return updated;
      });

      logAudit({
        action: 'MEMBER_ARCHIVED',
        entityType: 'member',
        entityId: id,
        summary: `Archived member ${member.fullName} (${member.memberNumber}) with financial history intact.`,
      });
      return {
        action: 'archived',
        message: `Member ${member.fullName} has historical payment records and was archived safely to preserve audit integrity.`,
      };
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== id));
      deleteMemberDoc(id);

      logAudit({
        action: 'MEMBER_DELETED',
        entityType: 'member',
        entityId: id,
        summary: `Permanently deleted member ${member.fullName} (${member.memberNumber}) (no financial history).`,
      });
      return {
        action: 'deleted',
        message: `Member ${member.fullName} had no financial records and was permanently deleted.`,
      };
    }
  };

  const restoreMember = (id: string) => {
    if (!canMutate) return;
    setMembers((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, status: 'active' as const } : m));
      const target = updated.find((m) => m.id === id);
      if (target) saveMemberDoc(target);
      return updated;
    });

    logAudit({
      action: 'MEMBER_UPDATED',
      entityType: 'member',
      entityId: id,
      summary: `Restored archived member ID: ${id} to active roster.`,
    });
  };

  // 3. Contribution operations
  const recalculateExpectedBalances = (nextContributions: Contribution[]) => {
    setMembers((prev) => prev.map((member) => {
      if (member.orgId !== currentOrgId) return member;
      const expectedBalance = nextContributions
        .filter((c) =>
          c.orgId === currentOrgId &&
          c.status === 'active' &&
          c.type !== 'donation' &&
          isObligationApplicableToMember(c, member)
        )
        .reduce((sum, c) => sum + c.amount, 0);
      const next = { ...member, expectedBalance };
      saveMemberDoc(next);
      return next;
    }));
  };

  const addContribution = (
    data: Omit<Contribution, 'id' | 'orgId' | 'createdAt' | 'status'>
  ): Contribution => {
    if (!canMutate) throw new Error('You do not have permission to create contributions.');
    const isDonation = data.type === 'donation';
    const normalizedAmount = normalizeWholeNaira(data.amount);
    if (!isDonation && normalizedAmount === null) {
      throw new Error('Contribution amount must be a positive whole-naira value within the supported limit.');
    }
    const amount = isDonation ? Math.max(0, Math.round(Number.isFinite(data.amount) ? data.amount : 0)) : normalizedAmount!;

    const newContrib: Contribution = {
      ...data,
      amount,
      id: `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: currentOrgId,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    setContributions((prev) => [...prev, newContrib]);
    saveContributionDoc(newContrib);

    if (!isDonation && amount > 0) {
      setMembers((prev) => {
        const updated = prev.map((m) => {
          if (
            m.orgId === currentOrgId &&
            m.status === 'active' &&
            isObligationApplicableToMember(newContrib, m)
          ) {
            const next = { ...m, expectedBalance: m.expectedBalance + amount };
            saveMemberDoc(next);
            return next;
          }
          return m;
        });
        return updated;
      });
    }

    const targetDesc =
      newContrib.targetType === 'category'
        ? `Targeted to categories: ${newContrib.targetCategories?.join(', ')}`
        : newContrib.targetType === 'members'
        ? `Targeted to ${newContrib.targetMemberIds?.length || 0} selected members`
        : `Assigned to all active members`;

    logAudit({
      action: 'CONTRIBUTION_CREATED',
      entityType: 'contribution',
      entityId: newContrib.id,
      summary: `Created ${newContrib.type.toUpperCase()}: "${newContrib.name}" for ${
        amount > 0 ? '₦' + amount.toLocaleString() : 'Free-will donation'
      }. ${targetDesc}.`,
      payload: {
        name: newContrib.name,
        type: newContrib.type,
        amount,
        targetType: newContrib.targetType,
      },
    });

    return newContrib;
  };

  const updateContribution = (id: string, data: Partial<Contribution>) => {
    if (!canMutate) return;
    setContributions((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== id) return c;
        const nextAmount = data.amount === undefined
          ? c.amount
          : (data.type || c.type) === 'donation'
          ? Math.max(0, Math.round(data.amount))
          : normalizeWholeNaira(data.amount);
        if (nextAmount === null) throw new Error('Contribution amount is invalid.');
        return { ...c, ...data, amount: nextAmount };
      });
      const target = updated.find((c) => c.id === id);
      if (target) saveContributionDoc(target);
      recalculateExpectedBalances(updated);
      return updated;
    });

    logAudit({
      action: 'CONTRIBUTION_UPDATED',
      entityType: 'contribution',
      entityId: id,
      summary: `Updated contribution details for ${data.name || 'obligation'}.`,
    });
  };

  const safeDeleteContribution = (id: string): { action: 'deleted' | 'archived'; message: string } => {
    if (!canMutate) return { action: 'archived', message: 'Unauthorized' };
    const contrib = contributions.find((c) => c.id === id);
    if (!contrib) return { action: 'archived', message: 'Contribution not found' };

    const hasAllocations = payments.some((p) =>
      p.allocations.some((a) => a.contributionId === id && a.amount > 0)
    );

    if (hasAllocations) {
      setContributions((prev) => {
        const updated = prev.map((c) => (c.id === id ? { ...c, status: 'archived' as const } : c));
        const target = updated.find((c) => c.id === id);
        if (target) saveContributionDoc(target);
        return updated;
      });

      logAudit({
        action: 'CONTRIBUTION_ARCHIVED',
        entityType: 'contribution',
        entityId: id,
        summary: `Archived contribution "${contrib.name}" to retain allocated payment history.`,
      });
      return {
        action: 'archived',
        message: `"${contrib.name}" has payment allocations and was archived to preserve financial records.`,
      };
    } else {
      setContributions((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        recalculateExpectedBalances(updated);
        return updated;
      });
      deleteContributionDoc(id);

      logAudit({
        action: 'CONTRIBUTION_DELETED',
        entityType: 'contribution',
        entityId: id,
        summary: `Deleted contribution "${contrib.name}" and safely adjusted member expected balances.`,
      });
      return {
        action: 'deleted',
        message: `"${contrib.name}" had no payment allocations and was safely deleted.`,
      };
    }
  };

  const restoreContribution = (id: string) => {
    if (!canMutate) return;
    setContributions((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, status: 'active' as const } : c));
      const target = updated.find((c) => c.id === id);
      if (target) saveContributionDoc(target);
      recalculateExpectedBalances(updated);
      return updated;
    });

    logAudit({
      action: 'CONTRIBUTION_RESTORED',
      entityType: 'contribution',
      entityId: id,
      summary: `Restored archived contribution ID: ${id}.`,
    });
  };

  // 4. Payment Recording & Official Receipt Issuance
  const recordPayment = (data: {
    memberId: string;
    amount: number;
    method: PaymentMethod;
    paymentDate: string;
    referenceNote?: string;
    channelDetails?: string;
    allocations: PaymentAllocation[];
  }): { success: boolean; payment?: Payment; message?: string } => {
    if (!canMutate) {
      return { success: false, message: 'Viewers cannot record payments.' };
    }

    const member = currentOrgMembers.find((m) => m.id === data.memberId && m.status === 'active');
    if (!member) {
      return { success: false, message: 'Member not found.' };
    }

    const wholeAmount = normalizeWholeNaira(data.amount);
    if (wholeAmount === null) {
      return { success: false, message: 'Payment must be a positive, finite whole-naira value within the supported limit.' };
    }
    if (!isValidIsoDate(data.paymentDate)) {
      return { success: false, message: 'A valid payment date is required.' };
    }
    const seen = new Set<string>();
    const validatedAllocations: PaymentAllocation[] = [];
    for (const allocation of data.allocations) {
      const amount = normalizeWholeNaira(allocation.amount);
      const contribution = currentOrgContributions.find((c) => c.id === allocation.contributionId);
      if (amount === null || !contribution || contribution.status !== 'active') {
        return { success: false, message: 'One or more payment allocations are invalid or inactive.' };
      }
      if (seen.has(contribution.id)) {
        return { success: false, message: 'A contribution can only be allocated once per payment.' };
      }
      if (contribution.type !== 'donation' && !isObligationApplicableToMember(contribution, member)) {
        return { success: false, message: `${contribution.name} does not apply to this member.` };
      }
      if (contribution.type !== 'donation') {
        const previouslyPaid = currentOrgPayments
          .filter((p) => p.memberId === member.id && p.status === 'confirmed')
          .flatMap((p) => p.allocations)
          .filter((a) => a.contributionId === contribution.id)
          .reduce((sum, a) => sum + a.amount, 0);
        if (amount > Math.max(0, contribution.amount - previouslyPaid)) {
          return { success: false, message: `Allocation to ${contribution.name} exceeds the outstanding obligation.` };
        }
      }
      seen.add(contribution.id);
      validatedAllocations.push({
        contributionId: contribution.id,
        contributionName: contribution.name,
        contributionType: contribution.type,
        amount,
      });
    }
    const totalAllocated = validatedAllocations.reduce((sum, a) => sum + a.amount, 0);

    if (totalAllocated > wholeAmount) {
      return { success: false, message: 'Total allocations cannot exceed the payment amount.' };
    }

    const unallocatedCredit = Math.max(0, wholeAmount - totalAllocated);

    const appliedObligationsAmount = validatedAllocations
      .filter((a) => a.contributionType !== 'donation')
      .reduce((sum, a) => sum + a.amount, 0);

    const balanceBefore = calcOutstanding(member.expectedBalance, member.paidBalance);
    const balanceAfter = Math.max(0, balanceBefore - appliedObligationsAmount);

    const dateObj = new Date(data.paymentDate || new Date());
    const yearStr = dateObj.getFullYear();
    const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
    const prefix = (currentOrg?.branding?.receiptPrefix || 'REC-')
      .replace(/[^A-Za-z0-9-]/g, '')
      .slice(0, 12) || 'REC-';
    const uniqueToken = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const receiptNumber = `${prefix}${yearStr}-${monthStr}-${uniqueToken}`;

    const newPayment: Payment = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: currentOrgId,
      receiptNumber,
      memberId: member.id,
      memberName: member.fullName,
      memberNumber: member.memberNumber,
      amount: wholeAmount,
      method: data.method,
      paymentDate: data.paymentDate || new Date().toISOString().split('T')[0],
      recordedAt: new Date().toISOString(),
      recordedByEmail: currentUser.email,
      recordedByName: currentUser.name,
      referenceNote: data.referenceNote,
      channelDetails: data.channelDetails,
      status: 'confirmed',
      allocations: validatedAllocations,
      unallocatedCredit,
      balanceBefore,
      balanceAfter,
    };

    setMembers((prev) => {
      const updated = prev.map((m) => {
        if (m.id === member.id) {
          const next = {
            ...m,
            paidBalance: Math.min(m.expectedBalance, m.paidBalance + appliedObligationsAmount),
            unallocatedCredit: m.unallocatedCredit + unallocatedCredit,
          };
          saveMemberDoc(next);
          return next;
        }
        return m;
      });
      return updated;
    });

    setPayments((prev) => [newPayment, ...prev]);
    savePaymentDoc(newPayment);

    logAudit({
      action: 'PAYMENT_RECORDED',
      entityType: 'payment',
      entityId: newPayment.id,
      summary: `Issued official receipt ${receiptNumber} for ₦${wholeAmount.toLocaleString()} to ${member.fullName} (${data.method.replace('_', ' ')}). Applied ₦${appliedObligationsAmount.toLocaleString()}, Unallocated ₦${unallocatedCredit.toLocaleString()}.`,
      payload: {
        receiptNumber,
        member: member.fullName,
        amount: wholeAmount,
        method: data.method,
        allocations: newPayment.allocations,
      },
    });

    return { success: true, payment: newPayment };
  };

  // 5. Controlled Payment Reversal
  const reversePayment = (
    paymentId: string,
    reason: string
  ): { success: boolean; message: string } => {
    if (!canMutate) {
      return { success: false, message: 'Viewers cannot reverse payments.' };
    }

    if (!reason || reason.trim().length < 5) {
      return { success: false, message: 'A meaningful reversal reason is compulsory (minimum 5 characters).' };
    }

    const payment = payments.find((p) => p.id === paymentId);
    if (!payment) {
      return { success: false, message: 'Payment record not found.' };
    }

    if (payment.status === 'reversed') {
      return { success: false, message: 'This payment has already been reversed.' };
    }

    const nonDonationAmount = payment.allocations
      .filter((a) => a.contributionType !== 'donation')
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    setMembers((prev) => {
      const updated = prev.map((m) => {
        if (m.id === payment.memberId) {
          const newPaid = Math.max(0, m.paidBalance - nonDonationAmount);
          const newCredit = Math.max(0, m.unallocatedCredit - (payment.unallocatedCredit || 0));
          const next = { ...m, paidBalance: newPaid, unallocatedCredit: newCredit };
          saveMemberDoc(next);
          return next;
        }
        return m;
      });
      return updated;
    });

    const reversedPayment: Payment = {
      ...payment,
      status: 'reversed',
      reversalReason: reason.trim(),
      reversedByEmail: currentUser.email,
      reversedByName: currentUser.name,
      reversedAt: new Date().toISOString(),
    };

    setPayments((prev) =>
      prev.map((p) => (p.id === paymentId ? reversedPayment : p))
    );
    savePaymentDoc(reversedPayment);

    logAudit({
      action: 'PAYMENT_REVERSED',
      entityType: 'payment',
      entityId: payment.id,
      summary: `Reversed receipt ${payment.receiptNumber} (₦${payment.amount.toLocaleString()}) for ${payment.memberName}. Reason: "${reason.trim()}". Adjusted applied dues by ₦${nonDonationAmount.toLocaleString()}.`,
      payload: {
        receiptNumber: payment.receiptNumber,
        member: payment.memberName,
        amount: payment.amount,
        reversalReason: reason.trim(),
      },
    });

    return {
      success: true,
      message: `Receipt ${payment.receiptNumber} successfully reversed. Member balances and financial totals have been recalculated.`,
    };
  };

  // 6. Expenses & Treasury
  const addExpense = (
    data: Omit<Expense, 'id' | 'orgId' | 'createdAt' | 'recordedByEmail' | 'recordedByName'>
  ): Expense => {
    if (!canMutate) throw new Error('You do not have permission to record expenses.');
    const amount = normalizeWholeNaira(data.amount);
    if (amount === null) throw new Error('Expense must be a positive, finite whole-naira value within the supported limit.');
    const newExpense: Expense = {
      ...data,
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: currentOrgId,
      amount,
      recordedByEmail: currentUser.email,
      recordedByName: currentUser.name,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    setExpenses((prev) => [newExpense, ...prev]);
    saveExpenseDoc(newExpense);

    logAudit({
      action: 'EXPENSE_RECORDED',
      entityType: 'expense',
      entityId: newExpense.id,
      summary: `Logged expenditure: ₦${newExpense.amount.toLocaleString()} for "${newExpense.title}" paid to ${newExpense.paidTo} from ${newExpense.custodianOrBankName}.`,
      payload: { title: newExpense.title, amount: newExpense.amount, category: newExpense.category },
    });

    return newExpense;
  };

  const deleteExpense = (id: string) => {
    if (!canMutate) return;
    const exp = expenses.find((e) => e.id === id);
    if (!exp) return;
    const voided = {
      ...exp,
      status: 'voided' as const,
      voidedAt: new Date().toISOString(),
      voidedByEmail: currentUser.email,
    };
    setExpenses((prev) => prev.map((e) => e.id === id ? voided : e));
    saveExpenseDoc(voided);

    logAudit({
      action: 'EXPENSE_VOIDED',
      entityType: 'expense',
      entityId: id,
      summary: `Removed expense entry: ₦${exp.amount.toLocaleString()} - ${exp.title}.`,
    });
  };

  // 7. Officer Governance (Admin Only)
  const addOfficer = (data: {
    userEmail: string;
    userName: string;
    role: Role;
  }): { success: boolean; message: string } => {
    if (!canManageOfficers) {
      return { success: false, message: 'Only Administrators can manage officers.' };
    }

    const emailClean = data.userEmail.trim().toLowerCase();
    const existing = currentOrgMemberships.find(
      (m) => m.userEmail.toLowerCase() === emailClean
    );

    if (existing) {
      return {
        success: false,
        message: `Officer with email "${emailClean}" already exists. You can update their role instead.`,
      };
    }

    const newMembership: OrgMembership = {
      id: `mship_${Date.now()}`,
      orgId: currentOrgId,
      userEmail: emailClean,
      userName: data.userName.trim(),
      role: data.role,
      status: 'pending',
      addedAt: new Date().toISOString(),
    };

    setMemberships((prev) => [...prev, newMembership]);
    saveMembershipDoc(newMembership);

    logAudit({
      action: 'OFFICER_ADDED',
      entityType: 'officer',
      entityId: newMembership.id,
      summary: `Added officer ${newMembership.userName} (${newMembership.userEmail}) as ${newMembership.role.toUpperCase()}.`,
      payload: { email: emailClean, role: data.role },
    });

    return { success: true, message: `Added ${newMembership.userName} as ${data.role}.` };
  };

  const elevateMemberToOfficer = (
    memberId: string,
    role: Role,
    customEmail?: string
  ): { success: boolean; message: string } => {
    if (!canManageOfficers) {
      return { success: false, message: 'Permission denied: Only Administrators can appoint officers.' };
    }

    const member = currentOrgMembers.find((m) => m.id === memberId);
    if (!member) {
      return { success: false, message: 'Selected member was not found in directory.' };
    }

    const email = (customEmail || member.email || '').trim().toLowerCase();
    if (!email) {
      return {
        success: false,
        message: `Member ${member.fullName} does not have an email on file. Please enter their login email to elevate them.`,
      };
    }

    return addOfficer({
      userName: member.fullName,
      userEmail: email,
      role,
    });
  };

  const updateOfficerRole = (
    membershipId: string,
    newRole: Role
  ): { success: boolean; message: string } => {
    if (!canManageOfficers) {
      return { success: false, message: 'Only Administrators can change officer roles.' };
    }

    const m = memberships.find((item) => item.id === membershipId);
    if (!m) return { success: false, message: 'Officer not found.' };

    const adminCount = currentOrgMemberships.filter((item) => item.role === 'admin').length;
    if (
      m.userEmail.toLowerCase() === currentUser.email.toLowerCase() &&
      m.role === 'admin' &&
      newRole !== 'admin' &&
      adminCount <= 1
    ) {
      return {
        success: false,
        message: 'You cannot remove your own administrator role when you are the only Administrator.',
      };
    }

    const updatedM: OrgMembership = { ...m, role: newRole };
    setMemberships((prev) =>
      prev.map((item) => (item.id === membershipId ? updatedM : item))
    );
    saveMembershipDoc(updatedM);

    logAudit({
      action: 'OFFICER_UPDATED',
      entityType: 'officer',
      entityId: membershipId,
      summary: `Changed role of ${m.userName} (${m.userEmail}) from ${m.role} to ${newRole}.`,
    });

    return { success: true, message: `Updated ${m.userName}'s role to ${newRole}.` };
  };

  const removeOfficer = (membershipId: string): { success: boolean; message: string } => {
    if (!canManageOfficers) {
      return { success: false, message: 'Only Administrators can remove officers.' };
    }

    const m = memberships.find((item) => item.id === membershipId);
    if (!m) return { success: false, message: 'Officer not found.' };

    if (m.userEmail.toLowerCase() === currentUser.email.toLowerCase()) {
      return {
        success: false,
        message: 'Administrators cannot remove their own access. Another Administrator must perform this action.',
      };
    }

    const adminCount = currentOrgMemberships.filter((item) => item.role === 'admin').length;
    if (m.role === 'admin' && adminCount <= 1) {
      return {
        success: false,
        message: 'The organization must retain at least one Administrator.',
      };
    }

    setMemberships((prev) => prev.filter((item) => item.id !== membershipId));
    deleteMembershipDoc(membershipId);

    logAudit({
      action: 'OFFICER_REMOVED',
      entityType: 'officer',
      entityId: membershipId,
      summary: `Removed officer ${m.userName} (${m.userEmail}) from organization roles.`,
    });

    return { success: true, message: `Removed officer ${m.userName}.` };
  };

  // Clear all local & app data
  const clearAllData = async () => {
    setOrganizations([]);
    setMembers([]);
    setContributions([]);
    setPayments([]);
    setExpenses([]);
    setAuditEvents([]);
    setMemberships([]);
    setCurrentOrgIdState('');

    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(STORAGE_KEY) && key !== `${STORAGE_KEY}_user`) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('LocalStorage clear warning:', e);
    }
  };

  // Purge test / demo records from organization's Firestore collections while keeping org and officers intact
  const purgeOrganizationData = async (orgId?: string): Promise<{ success: boolean; message: string; count?: number }> => {
    const targetOrgId = orgId || currentOrgId;
    if (!targetOrgId) {
      return { success: false, message: 'No active organization selected.' };
    }

    if (effectiveRole !== 'admin') {
      return { success: false, message: 'Permission denied: Only an Administrator can purge organization test records.' };
    }

    setSyncStatus('syncing');

    try {
      // 1. Purge from Firestore (members, contributions, payments, expenses, audit_events)
      const firestoreResult = await clearOrgFirestoreCollections(targetOrgId);

      // 2. Clear local memory states for this organization
      setMembers((prev) => prev.filter((m) => m.orgId !== targetOrgId));
      setContributions((prev) => prev.filter((c) => c.orgId !== targetOrgId));
      setPayments((prev) => prev.filter((p) => p.orgId !== targetOrgId));
      setExpenses((prev) => prev.filter((e) => e.orgId !== targetOrgId));

      // 3. Log a clean audit event marking the purge
      const purgeAudit: AuditEvent = {
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        orgId: targetOrgId,
        actorEmail: currentUser?.email || 'admin@duesbook.app',
        actorName: currentUser?.name || 'Administrator',
        actorRole: effectiveRole,
        timestamp: new Date().toISOString(),
        action: 'ORGANIZATION_DATA_PURGED',
        entityType: 'organization',
        entityId: targetOrgId,
        summary: `Admin ${currentUser?.name || 'Administrator'} purged test and demo records from Firestore collections (${firestoreResult.count} documents deleted). Organization profile and officer permissions preserved intact.`,
      };

      setAuditEvents([purgeAudit]);
      saveAuditEventDoc(purgeAudit);

      setSyncStatus('synced');
      return {
        success: true,
        count: firestoreResult.count,
        message: `Successfully cleared ${firestoreResult.count} demo/test records from Firestore. Organization structure and officer accounts remain intact.`,
      };
    } catch (err: any) {
      setSyncStatus('synced');
      return {
        success: false,
        message: err?.message || 'An error occurred while clearing data from Firestore.',
      };
    }
  };

  const resetToDemoData = async () => {
    await clearAllData();
  };

  return (
    <DuesBookContext.Provider
      value={{
        firebaseUser,
        authLoading,
        logout,
        loginAsDemoUser,
        syncStatus,

        currentUser,
        setCurrentUser,
        availableUsers: MOCK_USERS,
        currentRole,
        effectiveRole,
        simulatedRole,
        setSimulatedRole,
        canMutate,
        canManageOfficers,

        organizations,
        currentOrgId,
        currentOrg,
        setCurrentOrgId,
        createOrganization,
        updateOrganization,
        deleteOrganization,
        updateOrgBranding,
        addBankAccount,
        addCustodian,
        isNewUserOnboarding,
        completeOnboarding,

        memberships,
        currentOrgMemberships,
        addOfficer,
        elevateMemberToOfficer,
        updateOfficerRole,
        removeOfficer,

        members,
        currentOrgMembers,
        addMember,
        updateMember,
        safeDeleteMember,
        restoreMember,

        contributions,
        currentOrgContributions,
        addContribution,
        updateContribution,
        safeDeleteContribution,
        restoreContribution,

        payments,
        currentOrgPayments,
        recordPayment,
        reversePayment,

        expenses,
        currentOrgExpenses,
        addExpense,
        deleteExpense,

        auditEvents,
        currentOrgAuditEvents,

        resetToDemoData,
        clearAllData,
        purgeOrganizationData,
      }}
    >
      {children}
    </DuesBookContext.Provider>
  );
};

export const useDuesBook = () => {
  const context = useContext(DuesBookContext);
  if (!context) {
    throw new Error('useDuesBook must be used within a DuesBookProvider');
  }
  return context;
};
