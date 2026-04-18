import { apiRequest } from './client';
import type {
  AdminPanelResponse,
  AppSettings,
  ApprovalStatus,
  ImportResult,
  LoanRegistryRecord,
  MemberRegistryRecord,
  PaginationMeta,
  UserRole,
} from '../types';

export async function fetchAdminPanel(token: string) {
  return apiRequest<AdminPanelResponse>('admin-users', { method: 'GET' }, token);
}

export async function updateUserStatus(
  token: string,
  userId: string,
  approvalStatus: ApprovalStatus,
  role: UserRole,
) {
  return apiRequest<{ success: boolean; message: string }>(
    'admin-users',
    {
      method: 'PATCH',
      body: JSON.stringify({ userId, approvalStatus, role }),
    },
    token,
  );
}

export async function updateSettings(token: string, settings: AppSettings) {
  return apiRequest<{ success: boolean; message: string }>(
    'admin-users',
    {
      method: 'PUT',
      body: JSON.stringify(settings),
    },
    token,
  );
}

export async function importCsvData(token: string, importType: 'members' | 'loan-contracts', csvText: string) {
  return apiRequest<{ success: boolean; message: string; data: ImportResult }>(
    'admin-users',
    {
      method: 'POST',
      body: JSON.stringify({ importType, csvText }),
    },
    token,
  );
}

export async function fetchMembers(
  token: string,
  options: { search?: string; page?: number; pageSize?: number; activeFilter?: 'all' | 'active' | 'inactive' } = {},
) {
  const query = new URLSearchParams({ resource: 'members' });
  if (options.search?.trim()) {
    query.set('search', options.search.trim());
  }
  if (options.page) {
    query.set('page', String(options.page));
  }
  if (options.pageSize) {
    query.set('pageSize', String(options.pageSize));
  }
  if (options.activeFilter && options.activeFilter !== 'all') {
    query.set('status', options.activeFilter);
  }

  return apiRequest<{ success: boolean; data: { members: MemberRegistryRecord[]; pagination: PaginationMeta } }>(
    `admin-records?${query.toString()}`,
    { method: 'GET' },
    token,
  );
}

export async function createMemberRecord(
  token: string,
  member: {
    member_no: string;
    title: MemberRegistryRecord['title'];
    first_name: string;
    last_name: string;
    legacy_status: string;
    active: boolean;
  },
) {
  return apiRequest<{ success: boolean; message: string }>(
    'admin-records',
    {
      method: 'POST',
      body: JSON.stringify({
        resource: 'members',
        ...member,
      }),
    },
    token,
  );
}

export async function updateMemberRecord(token: string, member: Omit<MemberRegistryRecord, 'linked_users' | 'loan_contracts' | 'created_at' | 'updated_at'> & { legacy_status: string }) {
  return apiRequest<{ success: boolean; message: string }>(
    'admin-records',
    {
      method: 'PUT',
      body: JSON.stringify({
        resource: 'members',
        ...member,
      }),
    },
    token,
  );
}

export async function deleteMemberRecord(token: string, memberNo: string) {
  return apiRequest<{ success: boolean; message: string }>(
    'admin-records',
    {
      method: 'DELETE',
      body: JSON.stringify({ resource: 'members', member_no: memberNo }),
    },
    token,
  );
}

export async function fetchLoans(
  token: string,
  options: { search?: string; page?: number; pageSize?: number; statusFilter?: string } = {},
) {
  const query = new URLSearchParams({ resource: 'loans' });
  if (options.search?.trim()) {
    query.set('search', options.search.trim());
  }
  if (options.page) {
    query.set('page', String(options.page));
  }
  if (options.pageSize) {
    query.set('pageSize', String(options.pageSize));
  }
  if (options.statusFilter?.trim()) {
    query.set('status', options.statusFilter.trim());
  }

  return apiRequest<{ success: boolean; data: { loans: LoanRegistryRecord[]; pagination: PaginationMeta } }>(
    `admin-records?${query.toString()}`,
    { method: 'GET' },
    token,
  );
}

export async function createLoanRecord(token: string, loan: Omit<LoanRegistryRecord, 'created_at' | 'updated_at'>) {
  return apiRequest<{ success: boolean; message: string }>(
    'admin-records',
    {
      method: 'POST',
      body: JSON.stringify({
        resource: 'loans',
        ...loan,
      }),
    },
    token,
  );
}

export async function updateLoanRecord(token: string, loan: Omit<LoanRegistryRecord, 'created_at' | 'updated_at'>) {
  return apiRequest<{ success: boolean; message: string }>(
    'admin-records',
    {
      method: 'PUT',
      body: JSON.stringify({
        resource: 'loans',
        ...loan,
      }),
    },
    token,
  );
}

export async function deleteLoanRecord(token: string, contractNo: string) {
  return apiRequest<{ success: boolean; message: string }>(
    'admin-records',
    {
      method: 'DELETE',
      body: JSON.stringify({ resource: 'loans', contract_no: contractNo }),
    },
    token,
  );
}