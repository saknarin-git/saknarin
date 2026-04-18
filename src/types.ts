export type TitlePrefix = 'นาย' | 'นาง' | 'นางสาว' | 'เด็กชาย' | 'เด็กหญิง';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'member' | 'officer' | 'admin';

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

export interface SessionData {
  access_token: string;
  refresh_token: string;
  user: AppUser;
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
}

export interface ImportStats {
  members_count: number;
  loan_contracts_count: number;
}

export interface AdminOverview {
  members_count: number;
  active_members_count: number;
  inactive_members_count: number;
  users_count: number;
  approved_users_count: number;
  pending_users_count: number;
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
  loan_amount: number;
  outstanding_amount: number;
  status: string | null;
  contract_date: string | null;
  guarantor_1: string;
  guarantor_2: string | null;
  created_at: string;
  updated_at: string;
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

export type CsvImportType = 'members' | 'loan-contracts';

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