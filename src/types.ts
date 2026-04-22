export type TitlePrefix = 'นาย' | 'นาง' | 'นางสาว' | 'เด็กชาย' | 'เด็กหญิง';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'member' | 'officer' | 'admin' | 'dev_admin';
export type PermissionKey =
  | 'view_system_dashboard'
  | 'view_user_workspace'
  | 'view_officer_workspace'
  | 'manage_members'
  | 'manage_loans'
  | 'access_devmanager';

export type PermissionSet = Record<PermissionKey, boolean>;
export type RolePermissionsMatrix = Record<UserRole, PermissionSet>;

export interface MemberRecord {
  member_no: string;
  title: TitlePrefix;
  first_name: string;
  last_name: string;
}

export interface RegisterPayload {
  member_no: string;
  title: TitlePrefix;
  first_name: string;
  last_name: string;
  username: string;
  password: string;
}

export interface AppUser {
  id: string;
  member_no: string;
  title: TitlePrefix;
  first_name: string;
  last_name: string;
  username: string;
  role: UserRole;
  approval_status: ApprovalStatus;
}

export interface ProfileUpdatePayload {
  title: TitlePrefix;
  first_name: string;
  last_name: string;
}

export interface UserProfileDetails {
  user: AppUser;
  account: {
    created_at: string;
    approved_at: string | null;
  };
  member: {
    member_no: string;
    active: boolean;
    legacy_status: string | null;
    created_at: string;
    updated_at: string | null;
  };
  permissions: PermissionSet;
  settings: {
    group_name: string;
    notice: string;
  };
}

export interface SessionData {
  access_token: string;
  refresh_token: string;
  user: AppUser;
  permissions: PermissionSet;
}

export interface AuthResult {
  success: boolean;
  message: string;
  data?: SessionData;
}

export interface AppSettings {
  group_name: string;
  notice: string;
  allow_registration: boolean;
  role_permissions: RolePermissionsMatrix;
  loan_report_paper_settings: LoanReportPaperSettings;
}

export interface ImportStats {
  members_count: number;
  loan_contracts_count: number;
  loan_payments_count: number;
}

export interface AdminOverview {
  members_count: number;
  active_members_count: number;
  inactive_members_count: number;
  users_count: number;
  approved_users_count: number;
  pending_users_count: number;
  dev_admin_users_count: number;
  officer_users_count: number;
  admin_users_count: number;
  loan_contracts_count: number;
  active_loan_contracts_count: number;
  closed_loan_contracts_count: number;
  total_loan_amount: number;
  total_outstanding_amount: number;
}

export interface SystemOverviewResponse {
  success: boolean;
  data: {
    settings: AppSettings;
    overview: AdminOverview;
    current_user: {
      role: UserRole;
      approval_status: ApprovalStatus;
      permissions: PermissionSet;
    };
  };
}

export interface MemberRegistryRecord {
  member_no: string;
  title: TitlePrefix;
  first_name: string;
  last_name: string;
  legacy_status: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  linked_users: number;
  loan_contracts: number;
}

export interface LoanRegistryRecord {
  contract_no: string;
  member_no: string;
  title: TitlePrefix;
  first_name: string;
  last_name: string;
  loan_type_id: string | null;
  loan_amount: number;
  outstanding_amount: number;
  status: string | null;
  contract_date: string | null;
  guarantor_1: string;
  guarantor_2: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoanTypeRecord {
  id: string;
  name: string;
  annual_interest_rate: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type LoanPaymentMode = 'normal' | 'settlement';

export interface LoanPaymentCountedRecord {
  paid_date: string;
  payment_mode: LoanPaymentMode;
  principal_paid: number;
  interest_paid: number;
  interest_installments_paid: number;
  normalized_installments_paid: number;
  note: string | null;
}

export interface LoanPaymentCandidate {
  contract_no: string;
  member_no: string;
  title: TitlePrefix;
  first_name: string;
  last_name: string;
  loan_type_id: string | null;
  loan_type_name: string;
  annual_interest_rate: number;
  loan_amount: number;
  outstanding_amount: number;
  overdue_interest_installments: number;
  due_installments_count: number;
  current_interest_due: number;
  suggested_principal_amount: number;
  next_working_date: string | null;
  contract_date: string | null;
  status: string | null;
  applicable_working_dates: string[];
  counted_payments: LoanPaymentCountedRecord[];
}

export interface LoanWorkingDateEntry {
  month: number;
  date: string | null;
}

export interface LoanPaymentAuditRecord {
  id: string;
  external_reference: string | null;
  contract_no: string;
  member_no: string;
  member_name: string;
  payment_mode: LoanPaymentMode;
  paid_date: string;
  principal_paid: number;
  interest_paid: number;
  interest_installments_paid: number;
  remaining_balance: number;
  transaction_status: string | null;
  operator_name: string | null;
  note: string | null;
  created_at: string;
}

export interface LoanPaymentWorkspaceData {
  member: {
    member_no: string;
    title: TitlePrefix;
    first_name: string;
    last_name: string;
  };
  contracts: LoanPaymentCandidate[];
  selected_contract: LoanPaymentCandidate;
  working_calendar_year: number;
  working_dates: LoanWorkingDateEntry[];
  settlement_guard: {
    blocked: boolean;
    reasons: string[];
    due_interest_contract_nos: string[];
    guaranteed_contract_nos: string[];
  };
}

export interface LoanPaymentPreview {
  payment_mode: LoanPaymentMode;
  paid_date: string;
  contract_no: string;
  member_no: string;
  member_name: string;
  principal_paid: number;
  interest_paid: number;
  remaining_balance: number;
  interest_installments_paid: number;
  note: string;
}

export interface LoanPaymentRecord extends LoanPaymentPreview {
  id: string;
  created_at: string;
}

export interface LoanWorkspaceConfig {
  loan_types: LoanTypeRecord[];
  working_calendar_year: number;
  working_dates: LoanWorkingDateEntry[];
}

export interface LoanPaymentAuditData {
  payments: LoanPaymentAuditRecord[];
  pagination: PaginationMeta;
  working_calendar_year: number;
  working_dates: LoanWorkingDateEntry[];
}

export type LoanReportType = 'working-day' | 'outstanding';

export interface LoanReportSummary {
  opening_balance: number;
  principal_paid: number;
  interest_paid: number;
  settlement_amount: number;
  cash_received: number;
  closing_balance: number;
}

export interface LoanReportRow {
  sequence: number;
  member_no: string;
  member_name: string;
  contract_no: string;
  opening_balance: number;
  principal_paid: number;
  interest_paid: number;
  remaining_balance: number;
  normal_principal_amount: number;
  cash_amount: number;
  settlement_amount: number;
  note: string | null;
  payment_mode: LoanPaymentMode;
  overdue_installments: number;
  is_overdue: boolean;
  is_settlement: boolean;
}

export interface LoanReportData {
  report_type: LoanReportType;
  title: string;
  subtitle: string;
  group_name: string;
  paid_date: string;
  working_calendar_year: number;
  working_dates: LoanWorkingDateEntry[];
  rows_per_page: number;
  show_settlement_summary: boolean;
  summary: LoanReportSummary;
  totals: LoanReportSummary;
  rows: LoanReportRow[];
}

export type LoanReportColumnKey =
  | 'sequence'
  | 'member_no'
  | 'member_name'
  | 'opening_balance'
  | 'principal_paid'
  | 'interest_paid'
  | 'remaining_balance'
  | 'note';

export interface LoanReportColumnSize {
  width_mm: number;
  height_mm: number;
}

export type LoanReportColumnSettings = Record<LoanReportColumnKey, LoanReportColumnSize>;

export interface LoanReportPaperSettings {
  paper_size: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  margin_mm: number;
  font_scale: number;
  table_width_percent: number;
  table_height_percent: number;
  column_settings: LoanReportColumnSettings;
}

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ImportResult {
  total: number;
  inserted: number;
  updated: number;
}

export type CsvImportType = 'members' | 'loan-contracts' | 'transactions';

export interface CsvPreviewIssue {
  row_number: number;
  messages: string[];
}

export interface CsvPreviewSummary {
  file_name: string;
  required_headers: string[];
  headers: string[];
  matched_headers: string[];
  missing_headers: string[];
  row_count: number;
  sample_rows: Array<Record<string, string>>;
  issues: CsvPreviewIssue[];
  invalid_row_count: number;
  is_ready: boolean;
}

export interface AdminPanelResponse {
  success: boolean;
  data: {
    users: AppUser[];
    settings: AppSettings;
    import_stats: ImportStats;
    overview: AdminOverview;
  };
}