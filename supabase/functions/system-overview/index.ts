import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, ensurePermission, getDefaultRolePermissions, getPermissionsForRole, normalizeRolePermissions } from '../_shared/supabaseAdmin.ts';

interface LoanOverviewRow {
  loan_amount: number | null;
  outstanding_amount: number | null;
  status: string | null;
}

interface LoanReportPaperSettings {
  paper_size: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  margin_top_mm: number;
  margin_right_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  font_scale: number;
  table_width_percent: number;
  table_height_percent: number;
  column_settings: Record<string, { width_mm: number; height_mm: number; header_text: string }>;
}

const defaultLoanReportColumnSettings: Record<string, { width_mm: number; height_mm: number; header_text: string }> = {
  sequence: { width_mm: 9, height_mm: 8.5, header_text: 'ที่' },
  member_no: { width_mm: 14, height_mm: 8.5, header_text: 'เลขสมาชิก' },
  member_name: { width_mm: 45, height_mm: 8.5, header_text: 'ชื่อ - สกุล' },
  opening_balance: { width_mm: 22, height_mm: 8.5, header_text: 'หนี้ยกมา' },
  principal_paid: { width_mm: 20, height_mm: 8.5, header_text: 'ชำระต้น' },
  interest_paid: { width_mm: 20, height_mm: 8.5, header_text: 'ชำระดอกเบี้ย' },
  remaining_balance: { width_mm: 22, height_mm: 8.5, header_text: 'คงเหลือ' },
  note: { width_mm: 32, height_mm: 8.5, header_text: 'หมายเหตุ' },
};

const defaultLoanReportPaperSettings: LoanReportPaperSettings = {
  paper_size: 'a4',
  orientation: 'portrait',
  margin_top_mm: 10,
  margin_right_mm: 10,
  margin_bottom_mm: 10,
  margin_left_mm: 10,
  font_scale: 1,
  table_width_percent: 100,
  table_height_percent: 100,
  column_settings: defaultLoanReportColumnSettings,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numericValue));
}

function pxToMm(value: unknown) {
  return Math.round((Number(value) * 0.2645833333) * 10) / 10;
}

function normalizeLoanReportPaperSettings(value: unknown): LoanReportPaperSettings {
  if (!value || typeof value !== 'object') {
    return defaultLoanReportPaperSettings;
  }

  const source = value as Record<string, unknown>;
  const legacyMargin = clampNumber(source.margin_mm, defaultLoanReportPaperSettings.margin_top_mm, 6, 25);
  const rawColumnSettings = source.column_settings && typeof source.column_settings === 'object'
    ? source.column_settings as Record<string, unknown>
    : {};
  const columnSettings = Object.keys(defaultLoanReportColumnSettings).reduce<Record<string, { width_mm: number; height_mm: number; header_text: string }>>((map, key) => {
    const columnSource = rawColumnSettings[key] && typeof rawColumnSettings[key] === 'object'
      ? rawColumnSettings[key] as Record<string, unknown>
      : {};
    const widthMm = columnSource.width_mm ?? (columnSource.width_px !== undefined ? pxToMm(columnSource.width_px) : defaultLoanReportColumnSettings[key].width_mm);
    const heightMm = columnSource.height_mm ?? (columnSource.height_px !== undefined ? pxToMm(columnSource.height_px) : defaultLoanReportColumnSettings[key].height_mm);
    map[key] = {
      width_mm: clampNumber(widthMm, defaultLoanReportColumnSettings[key].width_mm, 6, 70),
      height_mm: clampNumber(heightMm, defaultLoanReportColumnSettings[key].height_mm, 6, 20),
      header_text: typeof columnSource.header_text === 'string' && columnSource.header_text.trim()
        ? columnSource.header_text.trim()
        : defaultLoanReportColumnSettings[key].header_text,
    };
    return map;
  }, { ...defaultLoanReportColumnSettings });

  return {
    paper_size: source.paper_size === 'letter' ? 'letter' : 'a4',
    orientation: source.orientation === 'landscape' ? 'landscape' : 'portrait',
    margin_top_mm: clampNumber(source.margin_top_mm, legacyMargin, 6, 25),
    margin_right_mm: clampNumber(source.margin_right_mm, legacyMargin, 6, 25),
    margin_bottom_mm: clampNumber(source.margin_bottom_mm, legacyMargin, 6, 25),
    margin_left_mm: clampNumber(source.margin_left_mm, legacyMargin, 6, 25),
    font_scale: clampNumber(source.font_scale, defaultLoanReportPaperSettings.font_scale, 0.85, 1.15),
    table_width_percent: clampNumber(source.table_width_percent, defaultLoanReportPaperSettings.table_width_percent, 70, 100),
    table_height_percent: clampNumber(source.table_height_percent, defaultLoanReportPaperSettings.table_height_percent, 70, 100),
    column_settings: columnSettings,
  };
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    const profile = await ensurePermission(accessToken, 'view_system_dashboard');

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
      { count: devAdminUsersCount, error: devAdminUsersCountError },
      { count: officerUsersCount, error: officerUsersCountError },
      { count: adminUsersCount, error: adminUsersCountError },
      { count: loanContractsCount, error: loanContractsCountError },
      { data: loanRows, error: loanRowsError },
    ] = await Promise.all([
      adminClient.from('app_settings').select('group_name, notice, allow_registration, role_permissions, loan_report_paper_settings').eq('id', 1).single(),
      adminClient.from('members').select('*', { count: 'exact', head: true }),
      adminClient.from('members').select('*', { count: 'exact', head: true }).eq('active', true),
      adminClient.from('app_users').select('*', { count: 'exact', head: true }),
      adminClient.from('app_users').select('*', { count: 'exact', head: true }).eq('approval_status', 'approved'),
      adminClient.from('app_users').select('*', { count: 'exact', head: true }).eq('approval_status', 'pending'),
      adminClient.from('app_users').select('*', { count: 'exact', head: true }).eq('role', 'dev_admin'),
      adminClient.from('app_users').select('*', { count: 'exact', head: true }).eq('role', 'officer'),
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
      devAdminUsersCountError ||
      officerUsersCountError ||
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
        devAdminUsersCountError ??
        officerUsersCountError ??
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
    const permissions = await getPermissionsForRole(profile.role);
    const rolePermissions = normalizeRolePermissions(settings?.role_permissions ?? getDefaultRolePermissions());
    const loanReportPaperSettings = normalizeLoanReportPaperSettings(settings?.loan_report_paper_settings);

    return jsonResponse({
      success: true,
      data: {
        settings: {
          group_name: settings.group_name,
          notice: settings.notice,
          allow_registration: settings.allow_registration,
          role_permissions: rolePermissions,
          loan_report_paper_settings: loanReportPaperSettings,
        },
        overview: {
          members_count: membersCount ?? 0,
          active_members_count: activeMembersCount ?? 0,
          inactive_members_count: Math.max((membersCount ?? 0) - (activeMembersCount ?? 0), 0),
          users_count: usersCount ?? 0,
          approved_users_count: approvedUsersCount ?? 0,
          pending_users_count: pendingUsersCount ?? 0,
          dev_admin_users_count: devAdminUsersCount ?? 0,
          officer_users_count: officerUsersCount ?? 0,
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
          permissions,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูลภาพรวมของระบบได้';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400;

    return jsonResponse({ success: false, message }, status);
  }
});