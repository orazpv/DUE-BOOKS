export type Role = 'admin' | 'treasurer' | 'financial_sec' | 'auditor' | 'secretary' | 'viewer';
export type UserRole = Role;

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface OrgBranding {
  primaryColor?: string; // Hex color code e.g. '#059669' (Emerald), '#1d4ed8' (Blue)
  secondaryColor?: string;
  logoUrl?: string; // Image base64 data URL or external URL
  letterheadHeader?: string; // Official formal legal header for printed docs
  letterheadSubheader?: string; // Subtitle / CAC Registration info
  contactAddress?: string; // Physical secretariat / office address
  contactPhone?: string; // Official inquiries phone number
  contactEmail?: string; // Official contact email
  website?: string; // Official website / portal
  letterheadFooter?: string; // Official disclaimer / footer note on printed documents
  signatoryTitle?: string; // e.g. "Financial Secretary", "Treasurer General", "President"
  signatoryName?: string; // Authorized signatory name
  signatureUrl?: string; // Digital stamp / signature image URL
  receiptPrefix?: string; // Custom receipt numbering prefix e.g. "REC-", "APX-", "DUES-"
  receiptNotes?: string; // Custom default terms / notes on receipts
  watermarkText?: string; // Custom watermark e.g. "OFFICIAL", "CONFIRMED"
  showLogoOnNavbar?: boolean; // Whether to display logo in top navbar
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  initialBalance: number;
}

export interface Custodian {
  id: string;
  name: string;
  role: string;
  phone?: string;
}

export interface Organization {
  id: string;
  name: string;
  motto?: string;
  type: 'association' | 'club' | 'alumni' | 'church' | 'community' | 'cooperative';
  currency: string;
  currencySymbol: string;
  code: string;
  createdAt: string;
  ownerUid?: string;
  bankAccounts: BankAccount[];
  custodians: Custodian[];
  branding?: OrgBranding;
}

export interface OrgMembership {
  id: string;
  orgId: string;
  userEmail: string;
  userId?: string;
  userName: string;
  role: Role;
  status: 'active' | 'pending';
  addedAt: string;
}

export type MemberCategory = 'regular' | 'executive' | 'elder' | 'honorary' | 'youth';

export interface Member {
  id: string;
  orgId: string;
  memberNumber: string;
  fullName: string;
  phone: string;
  email?: string;
  joinDate: string;
  category: MemberCategory;
  status: 'active' | 'archived';
  expectedBalance: number; // Compulsory expected total
  paidBalance: number;     // Total applied non-donation payments
  unallocatedCredit: number; // Excess credit retained
  notes?: string;
  createdAt: string;
}

export type ContributionType = 'dues' | 'levy' | 'recurring' | 'donation';
export type ObligationTargetType = 'all' | 'category' | 'members';

export interface Contribution {
  id: string;
  orgId: string;
  name: string;
  type: ContributionType;
  amount: number; // Whole naira amount. For 'donation', can be 0 (flexible)
  frequency: 'one_off' | 'monthly' | 'quarterly' | 'annual';
  dueDate?: string;
  description?: string;
  status: 'active' | 'archived';
  createdAt: string;
  targetType?: ObligationTargetType; // 'all' (default), 'category', or 'members'
  targetCategories?: MemberCategory[];
  targetMemberIds?: string[];
}

export type PaymentStatus = 'confirmed' | 'reversed';

export type PaymentMethod = 'bank_transfer' | 'cash' | 'pos' | 'cheque' | 'mobile_money';

export interface PaymentAllocation {
  contributionId: string;
  contributionName: string;
  contributionType: ContributionType;
  amount: number;
}

export interface Payment {
  id: string;
  orgId: string;
  receiptNumber: string;
  memberId: string;
  memberName: string;
  memberNumber: string;
  amount: number; // Whole naira
  method: PaymentMethod;
  paymentDate: string;
  recordedAt: string;
  recordedByEmail: string;
  recordedByName: string;
  referenceNote?: string;
  channelDetails?: string; // e.g. "First Bank Account" or "Cash to Peter Orazulike"
  status: PaymentStatus;
  allocations: PaymentAllocation[];
  unallocatedCredit: number;
  balanceBefore: number;
  balanceAfter: number;
  reversalReason?: string;
  reversedByEmail?: string;
  reversedByName?: string;
  reversedAt?: string;
}

export type ExpenseCategory =
  | 'meeting_refreshment'
  | 'venue_rental'
  | 'welfare_support'
  | 'project_execution'
  | 'printing_stationery'
  | 'bank_charges'
  | 'legal_admin'
  | 'honorarium'
  | 'transport_logistics'
  | 'other';

export interface Expense {
  id: string;
  orgId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  paidTo: string;
  paidFromType: 'cash' | 'bank';
  custodianOrBankId: string;
  custodianOrBankName: string;
  approvedBy: string;
  recordedByEmail: string;
  recordedByName: string;
  receiptRef?: string;
  description?: string;
  createdAt: string;
  status?: 'active' | 'voided';
  voidedAt?: string;
  voidedByEmail?: string;
}

export interface AuditEvent {
  id: string;
  orgId: string;
  actorEmail: string;
  actorName: string;
  actorRole: Role;
  action:
    | 'ORGANIZATION_CREATED'
    | 'ORGANIZATION_UPDATED'
    | 'ORGANIZATION_DELETED'
    | 'ORGANIZATION_DATA_PURGED'
    | 'MEMBER_CREATED'
    | 'MEMBER_UPDATED'
    | 'MEMBER_ARCHIVED'
    | 'MEMBER_DELETED'
    | 'CONTRIBUTION_CREATED'
    | 'CONTRIBUTION_UPDATED'
    | 'CONTRIBUTION_RESTORED'
    | 'CONTRIBUTION_ARCHIVED'
    | 'CONTRIBUTION_DELETED'
    | 'PAYMENT_RECORDED'
    | 'PAYMENT_REVERSED'
    | 'EXPENSE_RECORDED'
    | 'EXPENSE_VOIDED'
    | 'OFFICER_ADDED'
    | 'OFFICER_UPDATED'
    | 'OFFICER_REMOVED';
  entityType: 'organization' | 'member' | 'contribution' | 'payment' | 'expense' | 'officer';
  entityId: string;
  summary: string;
  payload?: Record<string, any>;
  timestamp: string;
}
