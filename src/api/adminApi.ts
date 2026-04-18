import { apiRequest } from './client';
import type {
  AdminPanelResponse,
  AppSettings,
  ApprovalStatus,
  ImportResult,
  LoanRegistryRecord,
  MemberRegistryRecord,
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

export async function fetchMembers(token: string, search = '') {
  const query = new URLSearchParams({ resource: 'members' });
  if (search.trim()) {
    query.set('search', search.trim());
  }

  return apiRequest<{ success: boolean; data: { members: MemberRegistryRecord[] } }>(
    `admin-records?${query.toString()}`,
    { method: 'GET' },
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

export async function fetchLoans(token: string, search = '') {
  const query = new URLSearchParams({ resource: 'loans' });
  if (search.trim()) {
    query.set('search', search.trim());
  }

  return apiRequest<{ success: boolean; data: { loans: LoanRegistryRecord[] } }>(
    `admin-records?${query.toString()}`,
    { method: 'GET' },
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