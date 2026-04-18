export type TitlePrefix = 'นาย' | 'นาง' | 'นางสาว' | 'เด็กชาย' | 'เด็กหญิง';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'member' | 'admin';

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

export interface AdminPanelResponse {
  success: boolean;
  data: {
    users: AppUser[];
    settings: AppSettings;
  };
}