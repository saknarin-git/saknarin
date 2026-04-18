import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, ensureUser } from '../_shared/supabaseAdmin.ts';

interface LoanOverviewRow {
  loan_amount: number | null;
  outstanding_amount: number | null;
  status: string | null;
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    const profile = await ensureUser(accessToken);

    if (request.method !== 'GET') {
      return jsonResponse({ success: false, message: 'Method not allowed' }, 405);
    }

    const [
      { data: settings, error: settingsError },
      { count: membersCount, error: membersCountError },
      { count: activeMembersCount, error: activeMembersCountError },
      { count: usersCount, error: usersCountError },
      { count: approvedUsersCount, error: approvedUsersCountError },
      { count: pendingUsersCount, error: pendingUsersCountError },
      { count: adminUsersCount, error: adminUsersCountError },
      { count: loanContractsCount, error: loanContractsCountError },
      { data: loanRows, error: loanRowsError },
    ] = await Promise.all([
      adminClient.from('app_settings').select('group_name, notice, allow_registration').eq('id', 1).single(),
      adminClient.from('members').select('*', { count: 'exact', head: true }),
      adminClient.from('members').select('*', { count: 'exact', head: true }).eq('active', true),
      adminClient.from('app_users').select('*', { count: 'exact', head: true }),
      adminClient.from('app_users').select('*', { count: 'exact', head: true }).eq('approval_status', 'approved'),
      adminClient.from('app_users').select('*', { count: 'exact', head: true }).eq('approval_status', 'pending'),
      adminClient.from('app_users').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
      adminClient.from('loan_contracts').select('*', { count: 'exact', head: true }),
      adminClient.from('loan_contracts').select('loan_amount, outstanding_amount, status'),
    ]);

    if (
      settingsError ||
      membersCountError ||
      activeMembersCountError ||
      usersCountError ||
      approvedUsersCountError ||
      pendingUsersCountError ||
      adminUsersCountError ||
      loanContractsCountError ||
      loanRowsError
    ) {
      throw settingsError ??
        membersCountError ??
        activeMembersCountError ??
        usersCountError ??
        approvedUsersCountError ??
        pendingUsersCountError ??
        adminUsersCountError ??
        loanContractsCountError ??
        loanRowsError;
    }

    const loans = (loanRows ?? []) as LoanOverviewRow[];
    const totalLoanAmount = loans.reduce((sum, loan) => sum + Number(loan.loan_amount ?? 0), 0);
    const totalOutstandingAmount = loans.reduce((sum, loan) => sum + Number(loan.outstanding_amount ?? 0), 0);
    const activeLoanContracts = loans.filter((loan) => Number(loan.outstanding_amount ?? 0) > 0).length;
    const closedLoanContracts = loans.filter((loan) => {
      const normalizedStatus = String(loan.status ?? '').trim().toLowerCase();
      return normalizedStatus.includes('ปิด') || normalizedStatus.includes('closed') || Number(loan.outstanding_amount ?? 0) <= 0;
    }).length;

    return jsonResponse({
      success: true,
      data: {
        settings,
        overview: {
          members_count: membersCount ?? 0,
          active_members_count: activeMembersCount ?? 0,
          inactive_members_count: Math.max((membersCount ?? 0) - (activeMembersCount ?? 0), 0),
          users_count: usersCount ?? 0,
          approved_users_count: approvedUsersCount ?? 0,
          pending_users_count: pendingUsersCount ?? 0,
          admin_users_count: adminUsersCount ?? 0,
          loan_contracts_count: loanContractsCount ?? 0,
          active_loan_contracts_count: activeLoanContracts,
          closed_loan_contracts_count: closedLoanContracts,
          total_loan_amount: totalLoanAmount,
          total_outstanding_amount: totalOutstandingAmount,
        },
        current_user: {
          role: profile.role,
          approval_status: profile.approval_status,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูลภาพรวมของระบบได้';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400;

    return jsonResponse({ success: false, message }, status);
  }
});