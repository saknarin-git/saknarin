import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, ensurePermission } from '../_shared/supabaseAdmin.ts';

type LoanPaymentMode = 'normal' | 'settlement';
type LoanWorkspaceResource = 'config' | 'payment-workspace' | 'payment';

const monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function getResource(value: string | null): LoanWorkspaceResource {
  if (value === 'config' || value === 'payment-workspace' || value === 'payment') {
    return value;
  }

  throw new Error('resource ไม่ถูกต้อง');
}

function getPaymentMode(value: string | null | undefined): LoanPaymentMode {
  if (value === 'normal' || value === 'settlement') {
    return value;
  }

  throw new Error('โหมดการรับชำระไม่ถูกต้อง');
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildDefaultWorkingDates(year: number) {
  return monthNumbers.map((month) => ({ month, date: null as string | null }));
}

function normalizeWorkingCalendar(value: unknown, year: number) {
  if (!value || typeof value !== 'object') {
    return {
      working_calendar_year: year,
      working_dates: buildDefaultWorkingDates(year),
    };
  }

  const source = value as Record<string, unknown>;
  const sourceYear = Number(source.year);
  const effectiveYear = Number.isInteger(sourceYear) && sourceYear === year ? sourceYear : year;
  const rawMonths = Array.isArray(source.months) ? source.months : [];
  const monthMap = new Map<number, string | null>();

  rawMonths.forEach((item) => {
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

    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== effectiveYear)) {
      return;
    }

    monthMap.set(month, date);
  });

  return {
    working_calendar_year: effectiveYear,
    working_dates: monthNumbers.map((month) => ({
      month,
      date: monthMap.get(month) ?? null,
    })),
  };
}

function parsePaidDate(value: unknown) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return new Date().toISOString().slice(0, 10);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('วันที่รับชำระไม่ถูกต้อง');
  }

  return trimmed;
}

function parseOptionalMoney(value: unknown) {
  const trimmed = String(value ?? '').replace(/,/g, '').trim();
  if (!trimmed) {
    return 0;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('จำนวนเงินชำระไม่ถูกต้อง');
  }

  return roundMoney(numeric);
}

function parseInstallmentCount(value: unknown, maxAllowed: number) {
  const numeric = Number(value ?? 0);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error('จำนวนงวดดอกค้างไม่ถูกต้อง');
  }

  if (numeric > maxAllowed) {
    throw new Error('จำนวนงวดดอกค้างที่ชำระเกินกว่าที่มีอยู่');
  }

  return numeric;
}

async function getConfig(targetYear = new Date().getFullYear()) {
  const [{ data: settings, error: settingsError }, { data: loanTypes, error: loanTypesError }] = await Promise.all([
    adminClient.from('app_settings').select('loan_working_days').eq('id', 1).single(),
    adminClient.from('loan_types').select('id, name, annual_interest_rate, active, created_at, updated_at').order('active', { ascending: false }).order('name', { ascending: true }),
  ]);

  if (settingsError || !settings) {
    throw settingsError ?? new Error('ไม่พบการตั้งค่าสินเชื่อ');
  }

  if (loanTypesError) {
    throw loanTypesError;
  }

  const calendar = normalizeWorkingCalendar(settings.loan_working_days, targetYear);

  return {
    loan_types: loanTypes ?? [],
    ...calendar,
  };
}

function buildInterestPerInstallment(outstandingAmount: number, annualInterestRate: number) {
  return roundMoney(outstandingAmount * ((annualInterestRate / 12) / 100));
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

function getNextWorkingDate(workingDates: Array<{ month: number; date: string | null }>, paidDateText: string) {
  return workingDates
    .filter((entry) => entry.date && entry.date > paidDateText)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))[0]?.date ?? null;
}

async function getGuaranteeObligations(memberNo: string) {
  const { data, error } = await adminClient
    .from('loan_contracts')
    .select('contract_no, member_no, outstanding_amount, guarantor_1, guarantor_2')
    .gt('outstanding_amount', 0)
    .neq('member_no', memberNo)
    .or(`guarantor_1.eq.${memberNo},guarantor_2.eq.${memberNo}`);

  if (error) {
    throw error;
  }

  return (data ?? []).map((item) => ({
    contract_no: String(item.contract_no ?? ''),
    member_no: String(item.member_no ?? ''),
    outstanding_amount: Number(item.outstanding_amount ?? 0),
  }));
}

async function getDueInterestContracts(memberNo: string, paidDateText: string) {
  const config = await getConfig(getPaymentYear(paidDateText));
  const { data: contracts, error: contractsError } = await adminClient
    .from('loan_contracts')
    .select('contract_no, contract_date')
    .eq('member_no', memberNo)
    .gt('outstanding_amount', 0);

  if (contractsError) {
    throw contractsError;
  }

  if (!contracts || contracts.length === 0) {
    return [];
  }

  const installmentsPaidMap = await getInterestInstallmentsPaid(contracts.map((item) => item.contract_no), getPaymentYear(paidDateText), paidDateText);

  return contracts
    .map((contract) => {
      const applicableWorkingDates = buildApplicableWorkingDates(config.working_dates, contract.contract_date, paidDateText);
      const dueInstallmentsCount = Math.max(0, applicableWorkingDates.length - (installmentsPaidMap.get(contract.contract_no) ?? 0));
      return {
        contract_no: contract.contract_no,
        due_installments_count: dueInstallmentsCount,
      };
    })
    .filter((contract) => contract.due_installments_count > 0);
}

function buildSettlementGuard(
  contracts: Array<{ contract_no: string; due_installments_count: number }>,
  guaranteeObligations: Array<{ contract_no: string; member_no: string; outstanding_amount: number }>,
) {
  const contractsWithDueInterest = contracts.filter((item) => item.due_installments_count > 0);
  const reasons: string[] = [];

  if (contractsWithDueInterest.length > 0) {
    reasons.push(`สมาชิกยังมีดอกเบี้ยที่ถึงกำหนดชำระ ${contractsWithDueInterest.length} สัญญา ต้องให้ดอกเบี้ยค้างชำระรวมงวดปัจจุบันเท่ากับ 0 ก่อนจึงจะกลบหนี้ได้`);
  }

  if (guaranteeObligations.length > 0) {
    reasons.push(`สมาชิกมีภาระค้ำประกันเงินกู้ให้สมาชิกรายอื่น ${guaranteeObligations.length} สัญญา จึงยังไม่สามารถกลบหนี้ได้`);
  }

  return {
    blocked: reasons.length > 0,
    reasons,
    due_interest_contract_nos: contractsWithDueInterest.map((item) => item.contract_no),
    guaranteed_contract_nos: guaranteeObligations.map((item) => item.contract_no),
  };
}

async function getInterestInstallmentsPaid(contractNos: string[], year: number, paidDateText: string) {
  if (contractNos.length === 0) {
    return new Map<string, number>();
  }

  const fromDate = `${year}-01-01`;
  const { data, error } = await adminClient
    .from('loan_payments')
    .select('contract_no, payment_mode, interest_installments_paid, interest_paid, note, paid_date')
    .in('contract_no', contractNos)
    .gte('paid_date', fromDate)
    .lte('paid_date', paidDateText);

  if (error) {
    throw error;
  }

  const result = new Map<string, number>();
  (data ?? []).forEach((item) => {
    const installmentsPaid = Number(item.interest_installments_paid ?? 0);
    const interestPaid = Number(item.interest_paid ?? 0);
    const normalizedNote = String(item.note ?? '').toLowerCase();
    const noteSuggestsInstallment = normalizedNote.includes('ดอกเบี้ย') || normalizedNote.includes('ประจำงวด');
    const normalizedInstallmentsPaid = installmentsPaid > 0
      ? installmentsPaid
      : interestPaid > 0
        ? 1
        : String(item.payment_mode ?? '') === 'normal' && noteSuggestsInstallment
          ? 1
          : 0;
    result.set(item.contract_no, (result.get(item.contract_no) ?? 0) + normalizedInstallmentsPaid);
  });

  return result;
}

async function getPaymentWorkspace(memberNo: string, mode: LoanPaymentMode, paidDateText: string) {
  const config = await getConfig(getPaymentYear(paidDateText));
  const memberNoTrimmed = memberNo.trim();
  if (!memberNoTrimmed) {
    throw new Error('กรุณากรอกเลขสมาชิก');
  }

  const [{ data: member, error: memberError }, { data: contracts, error: contractsError }] = await Promise.all([
    adminClient.from('members').select('member_no, title, first_name, last_name').eq('member_no', memberNoTrimmed).single(),
    adminClient
      .from('loan_contracts')
      .select('contract_no, member_no, title, first_name, last_name, loan_type_id, loan_amount, outstanding_amount, status, contract_date')
      .eq('member_no', memberNoTrimmed)
      .gt('outstanding_amount', 0)
      .order('outstanding_amount', { ascending: false })
      .order('contract_date', { ascending: true, nullsFirst: false }),
  ]);

  if (memberError || !member) {
    throw new Error('ไม่พบเลขสมาชิกในระบบ');
  }

  if (contractsError) {
    throw contractsError;
  }

  if (!contracts || contracts.length === 0) {
    throw new Error('สมาชิกนี้ไม่มีสัญญาเงินกู้คงเหลือสำหรับทำรายการ');
  }

  const activeTypeMap = new Map(config.loan_types.map((item) => [item.id, item]));
  const fallbackLoanType = config.loan_types.find((item) => item.active) ?? config.loan_types[0];
  const [installmentsPaidMap, guaranteeObligations] = await Promise.all([
    getInterestInstallmentsPaid((contracts ?? []).map((item) => item.contract_no), getPaymentYear(paidDateText), paidDateText),
    mode === 'settlement' ? getGuaranteeObligations(memberNoTrimmed) : Promise.resolve([]),
  ]);

  const normalizedContracts = contracts.map((contract) => {
    const loanType = (contract.loan_type_id ? activeTypeMap.get(contract.loan_type_id) : undefined) ?? fallbackLoanType;
    const annualInterestRate = Number(loanType?.annual_interest_rate ?? 0);
    const currentInterestDue = buildInterestPerInstallment(Number(contract.outstanding_amount ?? 0), annualInterestRate);
    const applicableWorkingDates = buildApplicableWorkingDates(config.working_dates, contract.contract_date, paidDateText);
    const totalDueInstallments = Math.max(0, applicableWorkingDates.length - (installmentsPaidMap.get(contract.contract_no) ?? 0));
    const overdueInstallments = Math.max(0, totalDueInstallments - 1);
    return {
      ...contract,
      loan_type_name: loanType?.name ?? 'ไม่ระบุประเภท',
      annual_interest_rate: annualInterestRate,
      due_installments_count: totalDueInstallments,
      overdue_interest_installments: overdueInstallments,
      current_interest_due: currentInterestDue,
      suggested_principal_amount: mode === 'settlement' ? Number(contract.outstanding_amount ?? 0) : 0,
      next_working_date: getNextWorkingDate(config.working_dates, paidDateText),
    };
  });

  const settlementGuard = mode === 'settlement'
    ? buildSettlementGuard(normalizedContracts.map((item) => ({
        contract_no: item.contract_no,
        due_installments_count: item.due_installments_count,
      })), guaranteeObligations)
    : {
        blocked: false,
        reasons: [],
        due_interest_contract_nos: [],
        guaranteed_contract_nos: [],
      };

  return {
    member,
    contracts: normalizedContracts,
    selected_contract: normalizedContracts[0],
    working_calendar_year: config.working_calendar_year,
    working_dates: config.working_dates,
    settlement_guard: settlementGuard,
  };
}

async function savePayment(payload: Record<string, unknown>, currentUserId: string) {
  const memberNo = String(payload.member_no ?? '').trim();
  const contractNo = String(payload.contract_no ?? '').trim();
  const paymentMode = getPaymentMode(String(payload.payment_mode ?? 'normal'));
  const paidDate = parsePaidDate(payload.paid_date);

  if (!memberNo || !contractNo) {
    throw new Error('ไม่พบข้อมูลสมาชิกหรือสัญญา');
  }

  const config = await getConfig(getPaymentYear(paidDate));
  const loanTypeMap = new Map(config.loan_types.map((item) => [item.id, item]));
  const fallbackLoanType = config.loan_types.find((item) => item.active) ?? config.loan_types[0];

  const { data: contract, error: contractError } = await adminClient
    .from('loan_contracts')
    .select('contract_no, member_no, title, first_name, last_name, loan_type_id, loan_amount, outstanding_amount, status, contract_date')
    .eq('contract_no', contractNo)
    .eq('member_no', memberNo)
    .single();

  if (contractError || !contract) {
    throw new Error('ไม่พบสัญญาเงินกู้ที่ต้องการรับชำระ');
  }

  const outstandingAmount = Number(contract.outstanding_amount ?? 0);
  if (outstandingAmount <= 0) {
    throw new Error('สัญญานี้ไม่มีหนี้คงเหลือแล้ว');
  }

  const installmentsPaidMap = await getInterestInstallmentsPaid([contract.contract_no], getPaymentYear(paidDate), paidDate);
  const applicableWorkingDates = buildApplicableWorkingDates(config.working_dates, contract.contract_date, paidDate);
  const totalDueInstallments = Math.max(0, applicableWorkingDates.length - (installmentsPaidMap.get(contract.contract_no) ?? 0));
  const defaultInstallmentsToPay = totalDueInstallments > 0 ? 1 : 0;
  const requestedInstallments = payload.interest_installments_paid === undefined || payload.interest_installments_paid === null || String(payload.interest_installments_paid).trim() === ''
    ? defaultInstallmentsToPay
    : Number(payload.interest_installments_paid);
  const interestInstallmentsPaid = parseInstallmentCount(requestedInstallments, totalDueInstallments);
  const loanType = (contract.loan_type_id ? loanTypeMap.get(contract.loan_type_id) : undefined) ?? fallbackLoanType;
  const annualInterestRate = Number(loanType?.annual_interest_rate ?? 0);
  const currentInterestDue = buildInterestPerInstallment(outstandingAmount, annualInterestRate);
  const interestPaid = roundMoney(currentInterestDue * interestInstallmentsPaid);
  const requestedPrincipalPaid = parseOptionalMoney(payload.principal_paid);
  const principalPaid = paymentMode === 'settlement' && requestedPrincipalPaid === 0
    ? roundMoney(outstandingAmount)
    : requestedPrincipalPaid;

  if (principalPaid > outstandingAmount) {
    throw new Error('จำนวนเงินต้นที่ชำระมากกว่ายอดหนี้คงเหลือ');
  }

  if (principalPaid === 0 && interestInstallmentsPaid === 0) {
    throw new Error('รายการนี้ไม่มีทั้งเงินต้นและดอกเบี้ยที่ต้องบันทึก');
  }

  if (paymentMode === 'settlement') {
    const [guaranteeObligations, dueInterestContracts] = await Promise.all([
      getGuaranteeObligations(memberNo),
      getDueInterestContracts(memberNo, paidDate),
    ]);
    const settlementGuard = buildSettlementGuard(dueInterestContracts, guaranteeObligations);

    if (settlementGuard.blocked) {
      throw new Error(settlementGuard.reasons[0] ?? 'ยังไม่สามารถกลบหนี้ได้');
    }
  }

  const remainingBalance = roundMoney(outstandingAmount - principalPaid);
  const note = paymentMode === 'settlement'
    ? 'กลบหนี้'
    : interestInstallmentsPaid > 1
      ? `ชำระดอกเบี้ย ${interestInstallmentsPaid} งวด`
      : principalPaid > 0
        ? 'ชำระต้นพร้อมดอกเบี้ยประจำงวด'
        : 'ชำระเฉพาะดอกเบี้ยประจำงวด';

  const preview = {
    payment_mode: paymentMode,
    paid_date: paidDate,
    contract_no: contract.contract_no,
    member_no: contract.member_no,
    member_name: `${contract.title}${contract.first_name} ${contract.last_name}`,
    principal_paid: principalPaid,
    interest_paid: interestPaid,
    remaining_balance: remainingBalance,
    interest_installments_paid: interestInstallmentsPaid,
    note,
  };

  const { data: payment, error: paymentError } = await adminClient
    .from('loan_payments')
    .insert({
      contract_no: contract.contract_no,
      member_no: contract.member_no,
      payment_mode: paymentMode,
      paid_date: paidDate,
      principal_paid: principalPaid,
      interest_paid: interestPaid,
      interest_installments_paid: interestInstallmentsPaid,
      remaining_balance: remainingBalance,
      note,
      created_by: currentUserId,
    })
    .select('id, contract_no, member_no, payment_mode, paid_date, principal_paid, interest_paid, interest_installments_paid, remaining_balance, note, created_at')
    .single();

  if (paymentError || !payment) {
    throw paymentError ?? new Error('ไม่สามารถบันทึกรายการรับชำระได้');
  }

  const { error: updateError } = await adminClient
    .from('loan_contracts')
    .update({
      outstanding_amount: remainingBalance,
      status: remainingBalance <= 0 ? 'ปิดบัญชี' : contract.status,
      updated_at: new Date().toISOString(),
    })
    .eq('contract_no', contract.contract_no);

  if (updateError) {
    throw updateError;
  }

  return {
    payment,
    preview,
  };
}

async function updateConfig(payload: Record<string, unknown>) {
  const workingCalendarYear = Number(payload.working_calendar_year ?? new Date().getFullYear());
  const workingCalendar = normalizeWorkingCalendar({ year: workingCalendarYear, months: payload.working_dates }, workingCalendarYear);
  const rawLoanTypes = Array.isArray(payload.loan_types) ? payload.loan_types : [];

  if (rawLoanTypes.length === 0) {
    throw new Error('กรุณากำหนดประเภทเงินกู้อย่างน้อย 1 ประเภท');
  }

  const seenNames = new Set<string>();
  const normalizedLoanTypes = rawLoanTypes.map((item) => {
    const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const name = String(source.name ?? '').trim();
    const normalizedName = name.toLocaleLowerCase('th-TH');
    const interestRate = Number(source.annual_interest_rate ?? 0);
    if (!name) {
      throw new Error('กรุณากรอกชื่อประเภทเงินกู้ให้ครบถ้วน');
    }

    if (seenNames.has(normalizedName)) {
      throw new Error('ชื่อประเภทเงินกู้ซ้ำกัน กรุณาตั้งชื่อไม่ให้ซ้ำ');
    }
    seenNames.add(normalizedName);

    if (!Number.isFinite(interestRate) || interestRate < 0) {
      throw new Error('อัตราดอกเบี้ยรายปีต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    }

    return {
      id: String(source.id ?? '').trim() || crypto.randomUUID(),
      name,
      annual_interest_rate: roundMoney(interestRate),
      active: Boolean(source.active),
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertError } = await adminClient.from('loan_types').upsert(normalizedLoanTypes, { onConflict: 'id' });
  if (upsertError) {
    if (upsertError.code === '23505') {
      throw new Error('ชื่อประเภทเงินกู้ซ้ำกับข้อมูลเดิมในระบบ');
    }
    throw upsertError;
  }

  const { error: settingsError } = await adminClient
    .from('app_settings')
    .upsert({
      id: 1,
      loan_working_days: {
        year: workingCalendar.working_calendar_year,
        months: workingCalendar.working_dates,
      },
      updated_at: new Date().toISOString(),
    });

  if (settingsError) {
    throw settingsError;
  }

  return getConfig();
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    const currentUser = await ensurePermission(accessToken, 'manage_loans');
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const resource = getResource(url.searchParams.get('resource'));

      if (resource === 'config') {
        return jsonResponse({ success: true, data: await getConfig() });
      }

      const memberNo = url.searchParams.get('memberNo')?.trim() ?? '';
      const mode = getPaymentMode(url.searchParams.get('mode'));
      const paidDate = parsePaidDate(url.searchParams.get('paidDate'));
      return jsonResponse({ success: true, data: await getPaymentWorkspace(memberNo, mode, paidDate) });
    }

    if (request.method === 'POST') {
      const { resource, ...payload } = await request.json() as Record<string, unknown> & { resource?: LoanWorkspaceResource };
      const resourceType = getResource(resource ?? null);

      if (resourceType !== 'payment') {
        throw new Error('resource ไม่ถูกต้อง');
      }

      return jsonResponse({ success: true, message: 'บันทึกรายการรับชำระเรียบร้อย', data: await savePayment(payload, currentUser.id) });
    }

    if (request.method === 'PUT') {
      const { resource, ...payload } = await request.json() as Record<string, unknown> & { resource?: LoanWorkspaceResource };
      const resourceType = getResource(resource ?? null);

      if (resourceType !== 'config') {
        throw new Error('resource ไม่ถูกต้อง');
      }

      return jsonResponse({ success: true, message: 'บันทึกการตั้งค่าสินเชื่อเรียบร้อย', data: await updateConfig(payload) });
    }

    return jsonResponse({ success: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ไม่สามารถจัดการงานสินเชื่อได้';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400;
    return jsonResponse({ success: false, message }, status);
  }
});