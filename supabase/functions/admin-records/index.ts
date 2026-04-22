import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, ensurePermission } from '../_shared/supabaseAdmin.ts';

type ResourceType = 'members' | 'loans' | 'payment-audit' | 'reports';
type LoanReportType = 'working-day' | 'outstanding';

const monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function parsePage(value: string | null, fallback: number) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback;
  }

  return Math.floor(numeric);
}

function getResourceType(value: string | null): ResourceType {
  if (value === 'members' || value === 'loans' || value === 'payment-audit' || value === 'reports') {
    return value;
  }

  throw new Error('resource ไม่ถูกต้อง');
}

function getLoanReportType(value: string | null): LoanReportType {
  if (value === 'working-day' || value === 'outstanding') {
    return value;
  }

  throw new Error('ประเภทรายงานไม่ถูกต้อง');
}

function parseDecimal(value: unknown) {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  if (!normalized) {
    throw new Error('กรุณากรอกจำนวนเงินให้ถูกต้อง');
  }

  const numericValue = Number(normalized);
  if (Number.isNaN(numericValue)) {
    throw new Error('กรุณากรอกจำนวนเงินให้ถูกต้อง');
  }

  return numericValue;
}

function parseContractDate(value: unknown) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [day, month, yearText] = trimmed.split('/');
    const year = Number(yearText) > 2400 ? Number(yearText) - 543 : Number(yearText);
    return `${String(year).padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  throw new Error('วันที่สร้างสัญญาไม่ถูกต้อง');
}

function parsePaidDate(value: unknown) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new Error('กรุณาเลือกวันทำการกลุ่ม');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('วันทำการกลุ่มไม่ถูกต้อง');
  }

  return trimmed;
}

function createPagination(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function buildDefaultWorkingDates(year: number) {
  return monthNumbers.map((month) => ({ month, date: null as string | null }));
}

function normalizeWorkingMonths(rawMonths: unknown, year: number) {
  const sourceMonths = Array.isArray(rawMonths) ? rawMonths : [];
  const monthMap = new Map<number, string | null>();

  sourceMonths.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const entry = item as Record<string, unknown>;
    const month = Number(entry.month);
    const date = entry.date === null || entry.date === undefined || String(entry.date).trim() === ''
      ? null
      : String(entry.date).trim();

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return;
    }

    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== year)) {
      return;
    }

    monthMap.set(month, date);
  });

  return {
    working_calendar_year: year,
    working_dates: monthNumbers.map((month) => ({
      month,
      date: monthMap.get(month) ?? null,
    })),
  };
}

function getStoredWorkingCalendarEntries(value: unknown) {
  if (!value || typeof value !== 'object') {
    return [] as Array<{ year: number; months: unknown }>;
  }

  const source = value as Record<string, unknown>;
  if (Array.isArray(source.years)) {
    return source.years
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        year: Number(item.year),
        months: item.months,
      }))
      .filter((item) => Number.isInteger(item.year) && item.year >= 1900 && item.year <= 2600);
  }

  const legacyYear = Number(source.year);
  if (Number.isInteger(legacyYear)) {
    return [{ year: legacyYear, months: source.months }];
  }

  return [] as Array<{ year: number; months: unknown }>;
}

function normalizeWorkingCalendar(value: unknown, year: number) {
  const matchedEntry = getStoredWorkingCalendarEntries(value).find((item) => item.year === year);
  if (!matchedEntry) {
    return {
      working_calendar_year: year,
      working_dates: buildDefaultWorkingDates(year),
    };
  }

  return normalizeWorkingMonths(matchedEntry.months, year);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getPaymentYear(dateText: string) {
  return Number(dateText.slice(0, 4));
}

function buildApplicableWorkingDates(
  workingDates: Array<{ month: number; date: string | null }>,
  contractDateText: string | null,
  paidDateText: string,
) {
  const paidDate = new Date(`${paidDateText}T00:00:00`);
  const paymentYear = paidDate.getFullYear();
  const contractDate = contractDateText ? new Date(`${contractDateText}T00:00:00`) : null;

  return workingDates
    .filter((entry) => entry.date)
    .map((entry) => ({
      month: entry.month,
      date: entry.date as string,
      dateValue: new Date(`${entry.date}T00:00:00`),
    }))
    .filter((entry) => entry.dateValue.getFullYear() === paymentYear)
    .filter((entry) => entry.dateValue <= paidDate)
    .filter((entry) => {
      if (!contractDate) {
        return true;
      }

      if (contractDate.getFullYear() < paymentYear) {
        return true;
      }

      return entry.dateValue > contractDate;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function getInterestInstallmentsPaid(contractNos: string[], year: number, paidDateText: string, includeSelectedDate = true) {
  if (contractNos.length === 0) {
    return new Map<string, number>();
  }

  let query = adminClient
    .from('loan_payments')
    .select('contract_no, payment_mode, principal_paid, interest_installments_paid, interest_paid, note, paid_date')
    .in('contract_no', contractNos)
    .gte('paid_date', `${year}-01-01`);

  query = includeSelectedDate ? query.lte('paid_date', paidDateText) : query.lt('paid_date', paidDateText);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const totals = new Map<string, number>();
  (data ?? []).forEach((item) => {
    const principalPaid = Number(item.principal_paid ?? 0);
    const installmentsPaid = Number(item.interest_installments_paid ?? 0);
    const interestPaid = Number(item.interest_paid ?? 0);
    const isNormalPayment = String(item.payment_mode ?? '') === 'normal';
    const normalizedNote = String(item.note ?? '').toLowerCase();
    const noteSuggestsInstallment = normalizedNote.includes('ดอกเบี้ย') || normalizedNote.includes('ประจำงวด');
    const normalizedInstallmentsPaid = installmentsPaid > 0
      ? installmentsPaid
      : interestPaid > 0
        ? 1
        : isNormalPayment && noteSuggestsInstallment
          ? 1
          : isNormalPayment && principalPaid > 0
            ? 1
            : 0;

    totals.set(String(item.contract_no ?? ''), (totals.get(String(item.contract_no ?? '')) ?? 0) + normalizedInstallmentsPaid);
  });

  return totals;
}

function compareMemberLike(left: string, right: string) {
  return left.localeCompare(right, 'th-TH', { numeric: true, sensitivity: 'base' });
}

function buildMemberFullName(title: unknown, firstName: unknown, lastName: unknown) {
  const parts = [String(title ?? '').trim(), String(firstName ?? '').trim(), String(lastName ?? '').trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '-';
}

function formatReportMoney(value: number) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value));
}

function buildCombinedPaymentNote(normalPrincipalAmount: number, settlementAmount: number) {
  if (settlementAmount <= 0) {
    return null;
  }

  if (normalPrincipalAmount > 0) {
    return 'ชำระต้น+กลบหนี้';
  }

  return 'กลบหนี้';
}

function buildOutstandingNote(overdueInstallments: number) {
  if (overdueInstallments <= 0) {
    return null;
  }

  return `(${overdueInstallments} งวด)`;
}

async function buildLoanReport(reportType: LoanReportType, paidDateText: string) {
  const [{ data: settings, error: settingsError }, { data: members, error: membersError }] = await Promise.all([
    adminClient.from('app_settings').select('group_name, loan_working_days').eq('id', 1).single(),
    reportType === 'working-day'
      ? Promise.resolve({ data: null, error: null })
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (settingsError || !settings) {
    throw settingsError ?? new Error('ไม่พบการตั้งค่าระบบ');
  }

  if (membersError) {
    throw membersError;
  }

  const paymentYear = getPaymentYear(paidDateText);
  const calendar = normalizeWorkingCalendar(settings.loan_working_days, paymentYear);
  const groupName = String(settings.group_name ?? '').trim() || 'กลุ่มออมทรัพย์';
  const rowsPerPage = 34;

  if (reportType === 'working-day') {
    const { data: payments, error: paymentsError } = await adminClient
      .from('loan_payments')
      .select('id, contract_no, member_no, payment_mode, paid_date, principal_paid, interest_paid, remaining_balance, note, created_at')
      .eq('paid_date', paidDateText);

    if (paymentsError) {
      throw paymentsError;
    }

    const paymentRows = payments ?? [];
    const [contractResult] = await Promise.all([
      adminClient
        .from('loan_contracts')
        .select('contract_no, member_no, title, first_name, last_name, outstanding_amount, contract_date')
        .order('member_no', { ascending: true })
        .order('contract_no', { ascending: true }),
    ]);

    if (contractResult.error) {
      throw contractResult.error;
    }

    const paymentsByContract = new Map<string, typeof paymentRows>();
    paymentRows.forEach((payment) => {
      const contractNo = String(payment.contract_no ?? '').trim();
      if (!contractNo) {
        return;
      }

      const currentRows = paymentsByContract.get(contractNo) ?? [];
      currentRows.push(payment);
      paymentsByContract.set(contractNo, currentRows);
    });

    const normalizedRows = (contractResult.data ?? [])
      .filter((contract) => {
        const contractNo = String(contract.contract_no ?? '').trim();
        const contractDate = contract.contract_date ? String(contract.contract_date) : null;
        const outstandingAmount = Number(contract.outstanding_amount ?? 0);
        return Boolean(contractDate) && contractDate < paidDateText && (outstandingAmount > 0 || paymentsByContract.has(contractNo));
      })
      .map((contract) => {
        const contractNo = String(contract.contract_no ?? '');
        const memberNo = String(contract.member_no ?? '');
        const contractPayments = [...(paymentsByContract.get(contractNo) ?? [])].sort((left, right) => {
          const leftCreatedAt = String(left.created_at ?? '');
          const rightCreatedAt = String(right.created_at ?? '');
          return leftCreatedAt.localeCompare(rightCreatedAt) || String(left.id ?? '').localeCompare(String(right.id ?? ''));
        });
        const principalPaid = roundMoney(contractPayments.reduce((sum, payment) => sum + Number(payment.principal_paid ?? 0), 0));
        const interestPaid = roundMoney(contractPayments.reduce((sum, payment) => sum + Number(payment.interest_paid ?? 0), 0));
        const normalPrincipalAmount = roundMoney(contractPayments.reduce((sum, payment) => (
          String(payment.payment_mode ?? 'normal') === 'settlement'
            ? sum
            : sum + Number(payment.principal_paid ?? 0)
        ), 0));
        const cashAmount = roundMoney(contractPayments.reduce((sum, payment) => (
          String(payment.payment_mode ?? 'normal') === 'settlement'
            ? sum
            : sum + Number(payment.principal_paid ?? 0) + Number(payment.interest_paid ?? 0)
        ), 0));
        const settlementAmount = roundMoney(contractPayments.reduce((sum, payment) => (
          String(payment.payment_mode ?? 'normal') === 'settlement'
            ? sum + Number(payment.principal_paid ?? 0) + Number(payment.interest_paid ?? 0)
            : sum
        ), 0));
        const remainingBalance = roundMoney(Number(contract.outstanding_amount ?? 0));
        const hasPayment = contractPayments.length > 0;

        return {
          member_no: memberNo,
          member_name: buildMemberFullName(contract.title, contract.first_name, contract.last_name),
          contract_no: contractNo,
          opening_balance: roundMoney(remainingBalance + principalPaid),
          principal_paid: principalPaid,
          interest_paid: interestPaid,
          remaining_balance: remainingBalance,
          normal_principal_amount: normalPrincipalAmount,
          cash_amount: cashAmount,
          settlement_amount: settlementAmount,
          note: hasPayment ? buildCombinedPaymentNote(normalPrincipalAmount, settlementAmount) : 'ขาดส่ง',
          payment_mode: settlementAmount > 0 && cashAmount === 0 ? 'settlement' : 'normal',
          overdue_installments: hasPayment ? 0 : 1,
          is_overdue: !hasPayment,
          is_settlement: settlementAmount > 0,
        };
      })
      .sort((left, right) => compareMemberLike(left.member_no, right.member_no) || compareMemberLike(left.contract_no, right.contract_no))
      .map((row, index) => ({
        sequence: index + 1,
        ...row,
      }));

    const totals = normalizedRows.reduce((summary, row) => ({
      opening_balance: roundMoney(summary.opening_balance + row.opening_balance),
      principal_paid: roundMoney(summary.principal_paid + row.principal_paid),
      interest_paid: roundMoney(summary.interest_paid + row.interest_paid),
      settlement_amount: roundMoney(summary.settlement_amount + row.settlement_amount),
      cash_received: roundMoney(summary.cash_received + row.cash_amount),
      closing_balance: roundMoney(summary.closing_balance + row.remaining_balance),
    }), {
      opening_balance: 0,
      principal_paid: 0,
      interest_paid: 0,
      settlement_amount: 0,
      cash_received: 0,
      closing_balance: 0,
    });

    return {
      report_type: reportType,
      title: 'รายงานวันทำการ',
      subtitle: 'สรุปรายการรับชำระประจำวันทำการกลุ่ม',
      group_name: groupName,
      paid_date: paidDateText,
      working_calendar_year: calendar.working_calendar_year,
      working_dates: calendar.working_dates,
      rows_per_page: rowsPerPage,
      show_settlement_summary: totals.settlement_amount > 0,
      summary: totals,
      totals,
      rows: normalizedRows,
    };
  }

  const { data: contracts, error: contractsError } = await adminClient
    .from('loan_contracts')
    .select('contract_no, member_no, title, first_name, last_name, outstanding_amount, contract_date')
    .gt('outstanding_amount', 0)
    .order('member_no', { ascending: true })
    .order('contract_no', { ascending: true });

  if (contractsError) {
    throw contractsError;
  }

  const contractRows = contracts ?? [];
  const installmentsPaidMap = await getInterestInstallmentsPaid(contractRows.map((item) => String(item.contract_no ?? '')), paymentYear, paidDateText, true);

  const normalizedRows = contractRows
    .map((contract, index) => {
      const openingBalance = Number(contract.outstanding_amount ?? 0);
      const applicableWorkingDates = buildApplicableWorkingDates(calendar.working_dates, contract.contract_date ? String(contract.contract_date) : null, paidDateText);
      const totalDueInstallments = Math.max(0, applicableWorkingDates.length - (installmentsPaidMap.get(String(contract.contract_no ?? '')) ?? 0));
      const overdueInstallments = Math.max(0, totalDueInstallments - 1);

      return {
        sequence: index + 1,
        member_no: String(contract.member_no ?? ''),
        member_name: buildMemberFullName(contract.title, contract.first_name, contract.last_name),
        contract_no: String(contract.contract_no ?? ''),
        opening_balance: openingBalance,
        principal_paid: 0,
        interest_paid: 0,
        remaining_balance: openingBalance,
        normal_principal_amount: 0,
        cash_amount: 0,
        settlement_amount: 0,
        note: buildOutstandingNote(overdueInstallments),
        payment_mode: 'normal',
        overdue_installments: overdueInstallments,
        is_overdue: overdueInstallments > 0,
        is_settlement: false,
      };
    })
    .sort((left, right) => compareMemberLike(left.member_no, right.member_no) || compareMemberLike(left.contract_no, right.contract_no))
    .map((row, index) => ({
      ...row,
      sequence: index + 1,
    }));

  const totalOutstanding = roundMoney(normalizedRows.reduce((sum, row) => sum + row.opening_balance, 0));

  return {
    report_type: reportType,
    title: 'รายงานหนี้คงค้าง',
    subtitle: 'สำหรับใช้ติดตามหนี้คงค้างในวันทำการถัดไป',
    group_name: groupName,
    paid_date: paidDateText,
    working_calendar_year: calendar.working_calendar_year,
    working_dates: calendar.working_dates,
    rows_per_page: rowsPerPage,
    show_settlement_summary: false,
    summary: {
      opening_balance: totalOutstanding,
      principal_paid: 0,
      interest_paid: 0,
      settlement_amount: 0,
      cash_received: 0,
      closing_balance: totalOutstanding,
    },
    totals: {
      opening_balance: totalOutstanding,
      principal_paid: 0,
      interest_paid: 0,
      settlement_amount: 0,
      cash_received: 0,
      closing_balance: totalOutstanding,
    },
    rows: normalizedRows,
  };
}

const TEMPORARY_GUARANTOR_STATUS = 'ผู้ค้ำชั่วคราว';
const NORMAL_MEMBER_STATUS = 'ปกติ';

function isTemporaryGuarantorStatus(status: string | null | undefined) {
  return String(status ?? '').includes(TEMPORARY_GUARANTOR_STATUS);
}

function isTemporaryMemberNo(memberNo: string) {
  return /^TMP-/i.test(memberNo.trim());
}

function getResolvedLegacyStatus(status: string) {
  const trimmed = status.trim();
  return !trimmed || isTemporaryGuarantorStatus(trimmed) ? NORMAL_MEMBER_STATUS : trimmed;
}

async function reconcileTemporaryGuarantors(member: {
  member_no: string;
  title: string;
  first_name: string;
  last_name: string;
  legacy_status: string;
  active: boolean;
}) {
  if (isTemporaryMemberNo(member.member_no)) {
    return false;
  }

  const { data: temporaryMembers, error: temporaryMembersError } = await adminClient
    .from('members')
    .select('member_no')
    .eq('first_name', member.first_name)
    .eq('last_name', member.last_name)
    .neq('member_no', member.member_no)
    .ilike('legacy_status', `%${TEMPORARY_GUARANTOR_STATUS}%`);

  if (temporaryMembersError) throw temporaryMembersError;

  const temporaryMemberNos = (temporaryMembers ?? [])
    .map((item) => String(item.member_no ?? '').trim())
    .filter(Boolean);

  if (temporaryMemberNos.length === 0) {
    return false;
  }

  const timestamp = new Date().toISOString();
  const orFilters = temporaryMemberNos.flatMap((memberNo) => [`guarantor_1.eq.${memberNo}`, `guarantor_2.eq.${memberNo}`]).join(',');
  const { data: loans, error: loansError } = await adminClient
    .from('loan_contracts')
    .select('contract_no, guarantor_1, guarantor_2')
    .or(orFilters);

  if (loansError) throw loansError;

  for (const loan of loans ?? []) {
    const guarantor1 = temporaryMemberNos.includes(String(loan.guarantor_1 ?? '').trim()) ? member.member_no : loan.guarantor_1;
    const guarantor2 = temporaryMemberNos.includes(String(loan.guarantor_2 ?? '').trim()) ? member.member_no : loan.guarantor_2;

    const { error: updateLoanError } = await adminClient
      .from('loan_contracts')
      .update({
        guarantor_1: guarantor1,
        guarantor_2: guarantor2,
        updated_at: timestamp,
      })
      .eq('contract_no', loan.contract_no);

    if (updateLoanError) throw updateLoanError;
  }

  const { error: updateMemberError } = await adminClient
    .from('members')
    .update({
      title: member.title,
      first_name: member.first_name,
      last_name: member.last_name,
      legacy_status: getResolvedLegacyStatus(member.legacy_status),
      active: member.active,
      updated_at: timestamp,
    })
    .eq('member_no', member.member_no);

  if (updateMemberError) throw updateMemberError;

  const { error: deleteTemporaryMembersError } = await adminClient
    .from('members')
    .delete()
    .in('member_no', temporaryMemberNos);

  if (deleteTemporaryMembersError) throw deleteTemporaryMembersError;

  return true;
}

async function listMembers(search: string, page: number, pageSize: number, status: string) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = adminClient
    .from('members')
    .select('member_no, title, first_name, last_name, legacy_status, active, created_at, updated_at', { count: 'exact' })
    .order('member_no', { ascending: true })
    .range(from, to);

  if (search) {
    query = query.or(`member_no.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }

  if (status === 'active') {
    query = query.eq('active', true);
  }

  if (status === 'inactive') {
    query = query.eq('active', false);
  }

  const { data: members, error, count } = await query;
  if (error) throw error;

  const memberNos = (members ?? []).map((item: { member_no: string }) => item.member_no);

  const [{ data: users, error: usersError }, { data: loans, error: loansError }] = memberNos.length > 0
    ? await Promise.all([
      adminClient.from('app_users').select('member_no').in('member_no', memberNos),
      adminClient.from('loan_contracts').select('member_no').in('member_no', memberNos),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (usersError || loansError) {
    throw usersError ?? loansError;
  }

  const userCountMap = new Map<string, number>();
  const loanCountMap = new Map<string, number>();

  (users ?? []).forEach((item: { member_no: string }) => {
    userCountMap.set(item.member_no, (userCountMap.get(item.member_no) ?? 0) + 1);
  });

  (loans ?? []).forEach((item: { member_no: string }) => {
    loanCountMap.set(item.member_no, (loanCountMap.get(item.member_no) ?? 0) + 1);
  });

  return {
    members: (members ?? []).map((member: { member_no: string } & Record<string, unknown>) => ({
    ...member,
    linked_users: userCountMap.get(member.member_no) ?? 0,
    loan_contracts: loanCountMap.get(member.member_no) ?? 0,
    })),
    pagination: createPagination(count ?? 0, page, pageSize),
  };
}

async function listLoans(search: string, page: number, pageSize: number, status: string) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = adminClient
    .from('loan_contracts')
    .select('contract_no, member_no, title, first_name, last_name, loan_type_id, loan_amount, outstanding_amount, status, contract_date, guarantor_1, guarantor_2, created_at, updated_at', { count: 'exact' })
    .order('member_no', { ascending: true })
    .order('contract_no', { ascending: true })
    .range(from, to);

  if (search) {
    query = query.or(`contract_no.ilike.%${search}%,member_no.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,status.ilike.%${search}%`);
  }

  if (status) {
    query = query.ilike('status', `%${status}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    loans: data ?? [],
    pagination: createPagination(count ?? 0, page, pageSize),
  };
}

async function listPaymentAudit(memberNo: string, paidDate: string, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = adminClient
    .from('loan_payments')
    .select('id, external_reference, contract_no, member_no, payment_mode, paid_date, principal_paid, interest_paid, interest_installments_paid, remaining_balance, transaction_status, operator_name, note, created_by, created_at', { count: 'exact' })
    .order('paid_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (memberNo) {
    query = query.ilike('member_no', `%${memberNo}%`);
  }

  if (paidDate) {
    query = query.eq('paid_date', paidDate);
  }

  const [paymentsResult, settingsResult] = await Promise.all([
    query,
    adminClient.from('app_settings').select('loan_working_days').eq('id', 1).single(),
  ]);

  const { data: payments, error: paymentsError, count } = paymentsResult;
  const { data: settings, error: settingsError } = settingsResult;

  if (paymentsError || settingsError) {
    throw paymentsError ?? settingsError;
  }

  const targetYear = paidDate ? Number(paidDate.slice(0, 4)) : new Date().getFullYear();
  const calendar = normalizeWorkingCalendar(settings?.loan_working_days, targetYear);
  const memberNos = [...new Set((payments ?? []).map((item) => String(item.member_no ?? '')).filter(Boolean))];
  const creatorIds = [...new Set((payments ?? []).map((item) => String(item.created_by ?? '')).filter(Boolean))];

  const [{ data: members, error: membersError }, { data: creators, error: creatorsError }] = await Promise.all([
    memberNos.length > 0
      ? adminClient.from('members').select('member_no, title, first_name, last_name').in('member_no', memberNos)
      : Promise.resolve({ data: [], error: null }),
    creatorIds.length > 0
      ? adminClient.from('app_users').select('id, title, first_name, last_name, username').in('id', creatorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (membersError || creatorsError) {
    throw membersError ?? creatorsError;
  }

  const memberNameMap = new Map(
    (members ?? []).map((member) => [
      String(member.member_no),
      `${String(member.title ?? '')}${String(member.first_name ?? '')} ${String(member.last_name ?? '')}`.trim(),
    ]),
  );
  const creatorNameMap = new Map(
    (creators ?? []).map((creator) => [
      String(creator.id),
      `${String(creator.title ?? '')}${String(creator.first_name ?? '')} ${String(creator.last_name ?? '')}`.trim() || String(creator.username ?? ''),
    ]),
  );

  return {
    payments: (payments ?? []).map((payment) => ({
      id: String(payment.id ?? ''),
      external_reference: payment.external_reference ? String(payment.external_reference) : null,
      contract_no: String(payment.contract_no ?? ''),
      member_no: String(payment.member_no ?? ''),
      member_name: memberNameMap.get(String(payment.member_no ?? '')) ?? '-',
      payment_mode: String(payment.payment_mode ?? 'normal'),
      paid_date: String(payment.paid_date ?? ''),
      principal_paid: Number(payment.principal_paid ?? 0),
      interest_paid: Number(payment.interest_paid ?? 0),
      interest_installments_paid: Number(payment.interest_installments_paid ?? 0),
      remaining_balance: Number(payment.remaining_balance ?? 0),
      transaction_status: payment.transaction_status ? String(payment.transaction_status) : null,
      operator_name: payment.operator_name ? String(payment.operator_name) : creatorNameMap.get(String(payment.created_by ?? '')) ?? null,
      note: payment.note ? String(payment.note) : null,
      created_at: String(payment.created_at ?? ''),
    })),
    pagination: createPagination(count ?? 0, page, pageSize),
    ...calendar,
  };
}

async function createMember(payload: Record<string, unknown>) {
  const memberNo = String(payload.member_no ?? '').trim();
  const title = String(payload.title ?? '').trim();
  const firstName = String(payload.first_name ?? '').trim();
  const lastName = String(payload.last_name ?? '').trim();
  const legacyStatus = String(payload.legacy_status ?? '').trim();
  const active = Boolean(payload.active);

  if (!memberNo || !title || !firstName || !lastName) {
    throw new Error('ข้อมูลสมาชิกไม่ครบถ้วน');
  }

  const { data: existing, error: existingError } = await adminClient
    .from('members')
    .select('member_no')
    .eq('member_no', memberNo)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    throw new Error('เลขที่สมาชิกนี้มีอยู่แล้วในระบบ');
  }

  const { error } = await adminClient.from('members').insert({
    member_no: memberNo,
    title,
    first_name: firstName,
    last_name: lastName,
    legacy_status: legacyStatus || null,
    active,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;

  await reconcileTemporaryGuarantors({
    member_no: memberNo,
    title,
    first_name: firstName,
    last_name: lastName,
    legacy_status: legacyStatus,
    active,
  });
}

async function updateMember(payload: Record<string, unknown>) {
  const memberNo = String(payload.member_no ?? '').trim();
  const title = String(payload.title ?? '').trim();
  const firstName = String(payload.first_name ?? '').trim();
  const lastName = String(payload.last_name ?? '').trim();
  const legacyStatus = String(payload.legacy_status ?? '').trim();
  const active = Boolean(payload.active);

  if (!memberNo || !title || !firstName || !lastName) {
    throw new Error('ข้อมูลสมาชิกไม่ครบถ้วน');
  }

  const timestamp = new Date().toISOString();

  const { error: memberError } = await adminClient
    .from('members')
    .update({
      title,
      first_name: firstName,
      last_name: lastName,
      legacy_status: legacyStatus || null,
      active,
      updated_at: timestamp,
    })
    .eq('member_no', memberNo);

  if (memberError) throw memberError;

  const { error: userError } = await adminClient
    .from('app_users')
    .update({
      title,
      first_name: firstName,
      last_name: lastName,
    })
    .eq('member_no', memberNo);

  if (userError) throw userError;

  const { error: loanError } = await adminClient
    .from('loan_contracts')
    .update({
      title,
      first_name: firstName,
      last_name: lastName,
      updated_at: timestamp,
    })
    .eq('member_no', memberNo);

  if (loanError) throw loanError;

  await reconcileTemporaryGuarantors({
    member_no: memberNo,
    title,
    first_name: firstName,
    last_name: lastName,
    legacy_status: legacyStatus,
    active,
  });
}

async function deleteMember(memberNo: string, adminMemberNo: string) {
  if (!memberNo) {
    throw new Error('ไม่พบเลขที่สมาชิก');
  }

  if (memberNo === adminMemberNo) {
    throw new Error('ไม่สามารถลบบัญชีผู้ดูแลระบบที่กำลังใช้งานอยู่ได้');
  }

  const { data: linkedUsers, error: userQueryError } = await adminClient
    .from('app_users')
    .select('auth_user_id')
    .eq('member_no', memberNo);

  if (userQueryError) throw userQueryError;

  const { error: loanDeleteError } = await adminClient
    .from('loan_contracts')
    .delete()
    .eq('member_no', memberNo);

  if (loanDeleteError) throw loanDeleteError;

  const { error: userDeleteError } = await adminClient
    .from('app_users')
    .delete()
    .eq('member_no', memberNo);

  if (userDeleteError) throw userDeleteError;

  const { error: memberDeleteError } = await adminClient
    .from('members')
    .delete()
    .eq('member_no', memberNo);

  if (memberDeleteError) throw memberDeleteError;

  for (const linkedUser of linkedUsers ?? []) {
    const { error } = await adminClient.auth.admin.deleteUser(linkedUser.auth_user_id);
    if (error) {
      throw error;
    }
  }
}

async function updateLoan(payload: Record<string, unknown>) {
  const contractNo = String(payload.contract_no ?? '').trim();
  const memberNo = String(payload.member_no ?? '').trim();
  const title = String(payload.title ?? '').trim();
  const firstName = String(payload.first_name ?? '').trim();
  const lastName = String(payload.last_name ?? '').trim();
  const guarantor1 = String(payload.guarantor_1 ?? '').trim();
  const guarantor2 = String(payload.guarantor_2 ?? '').trim();
  const loanTypeId = String(payload.loan_type_id ?? '').trim();

  if (!contractNo || !memberNo || !title || !firstName || !lastName || !guarantor1) {
    throw new Error('ข้อมูลสินเชื่อไม่ครบถ้วน');
  }

  const { data: member, error: memberError } = await adminClient
    .from('members')
    .select('member_no')
    .eq('member_no', memberNo)
    .single();

  if (memberError || !member) {
    throw new Error('ไม่พบเลขที่สมาชิกในระบบ');
  }

  const { error } = await adminClient
    .from('loan_contracts')
    .update({
      member_no: memberNo,
      title,
      first_name: firstName,
      last_name: lastName,
      loan_type_id: loanTypeId || null,
      loan_amount: parseDecimal(payload.loan_amount),
      outstanding_amount: parseDecimal(payload.outstanding_amount),
      status: String(payload.status ?? '').trim() || null,
      contract_date: parseContractDate(payload.contract_date),
      guarantor_1: guarantor1,
      guarantor_2: guarantor2 || null,
      updated_at: new Date().toISOString(),
    })
    .eq('contract_no', contractNo);

  if (error) throw error;
}

async function createLoan(payload: Record<string, unknown>) {
  const contractNo = String(payload.contract_no ?? '').trim();
  const memberNo = String(payload.member_no ?? '').trim();
  const title = String(payload.title ?? '').trim();
  const firstName = String(payload.first_name ?? '').trim();
  const lastName = String(payload.last_name ?? '').trim();
  const guarantor1 = String(payload.guarantor_1 ?? '').trim();
  const guarantor2 = String(payload.guarantor_2 ?? '').trim();
  const loanTypeId = String(payload.loan_type_id ?? '').trim();

  if (!contractNo || !memberNo || !title || !firstName || !lastName || !guarantor1) {
    throw new Error('ข้อมูลสินเชื่อไม่ครบถ้วน');
  }

  const { data: existing, error: existingError } = await adminClient
    .from('loan_contracts')
    .select('contract_no')
    .eq('contract_no', contractNo)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    throw new Error('เลขที่สัญญานี้มีอยู่แล้วในระบบ');
  }

  const { data: member, error: memberError } = await adminClient
    .from('members')
    .select('member_no')
    .eq('member_no', memberNo)
    .single();

  if (memberError || !member) {
    throw new Error('ไม่พบเลขที่สมาชิกในระบบ');
  }

  const { error } = await adminClient.from('loan_contracts').insert({
    contract_no: contractNo,
    member_no: memberNo,
    title,
    first_name: firstName,
    last_name: lastName,
    loan_type_id: loanTypeId || null,
    loan_amount: parseDecimal(payload.loan_amount),
    outstanding_amount: parseDecimal(payload.outstanding_amount),
    status: String(payload.status ?? '').trim() || null,
    contract_date: parseContractDate(payload.contract_date),
    guarantor_1: guarantor1,
    guarantor_2: guarantor2 || null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

async function deleteLoan(contractNo: string) {
  if (!contractNo) {
    throw new Error('ไม่พบเลขที่สัญญา');
  }

  const { error } = await adminClient
    .from('loan_contracts')
    .delete()
    .eq('contract_no', contractNo);

  if (error) throw error;
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const resource = getResourceType(url.searchParams.get('resource'));
      const search = url.searchParams.get('search')?.trim() ?? '';
      const page = parsePage(url.searchParams.get('page'), 1);
      const pageSize = parsePage(url.searchParams.get('pageSize'), 20);
      const status = url.searchParams.get('status')?.trim() ?? '';

      if (resource === 'reports') {
        await ensurePermission(accessToken, 'access_devmanager');
        const reportType = getLoanReportType(url.searchParams.get('reportType'));
        const paidDate = parsePaidDate(url.searchParams.get('paidDate'));
        const data = await buildLoanReport(reportType, paidDate);
        return jsonResponse({ success: true, data });
      }

      if (resource === 'payment-audit') {
        await ensurePermission(accessToken, 'access_devmanager');
        const memberNo = url.searchParams.get('memberNo')?.trim() ?? '';
        const paidDate = url.searchParams.get('paidDate')?.trim() ?? '';
        const data = await listPaymentAudit(memberNo, paidDate, page, pageSize);
        return jsonResponse({ success: true, data });
      }

      await ensurePermission(accessToken, resource === 'members' ? 'manage_members' : 'manage_loans');

      if (resource === 'members') {
        const data = await listMembers(search, page, pageSize, status);
        return jsonResponse({ success: true, data });
      }

      const data = await listLoans(search, page, pageSize, status);
      return jsonResponse({ success: true, data });
    }

    if (request.method === 'POST') {
      const { resource, ...payload } = await request.json() as Record<string, unknown> & { resource?: ResourceType };
      const resourceType = getResourceType(resource ?? null);
      if (resourceType === 'payment-audit' || resourceType === 'reports') {
        return jsonResponse({ success: false, message: 'resource ไม่รองรับการสร้างข้อมูล' }, 400);
      }
      await ensurePermission(accessToken, resourceType === 'members' ? 'manage_members' : 'manage_loans');

      if (resourceType === 'members') {
        await createMember(payload);
        return jsonResponse({ success: true, message: 'สร้างข้อมูลสมาชิกเรียบร้อย' });
      }

      await createLoan(payload);
      return jsonResponse({ success: true, message: 'สร้างข้อมูลสินเชื่อเรียบร้อย' });
    }

    if (request.method === 'PUT') {
      const { resource, ...payload } = await request.json() as Record<string, unknown> & { resource?: ResourceType };
      const resourceType = getResourceType(resource ?? null);
      if (resourceType === 'payment-audit' || resourceType === 'reports') {
        return jsonResponse({ success: false, message: 'resource ไม่รองรับการแก้ไขข้อมูล' }, 400);
      }
      await ensurePermission(accessToken, resourceType === 'members' ? 'manage_members' : 'manage_loans');

      if (resourceType === 'members') {
        await updateMember(payload);
        return jsonResponse({ success: true, message: 'บันทึกข้อมูลสมาชิกเรียบร้อย' });
      }

      await updateLoan(payload);
      return jsonResponse({ success: true, message: 'บันทึกข้อมูลสินเชื่อเรียบร้อย' });
    }

    if (request.method === 'DELETE') {
      const { resource, member_no: memberNo, contract_no: contractNo } = await request.json() as {
        resource?: ResourceType;
        member_no?: string;
        contract_no?: string;
      };

      const resourceType = getResourceType(resource ?? null);
      if (resourceType === 'payment-audit' || resourceType === 'reports') {
        return jsonResponse({ success: false, message: 'resource ไม่รองรับการลบข้อมูล' }, 400);
      }
      const currentUser = await ensurePermission(accessToken, resourceType === 'members' ? 'manage_members' : 'manage_loans');

      if (resourceType === 'members') {
        await deleteMember(String(memberNo ?? '').trim(), currentUser.member_no);
        return jsonResponse({ success: true, message: 'ลบข้อมูลสมาชิกเรียบร้อย' });
      }

      await deleteLoan(String(contractNo ?? '').trim());
      return jsonResponse({ success: true, message: 'ลบข้อมูลสินเชื่อเรียบร้อย' });
    }

    return jsonResponse({ success: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ไม่สามารถจัดการข้อมูลได้';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400;
    return jsonResponse({ success: false, message }, status);
  }
});