import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, canManageRole, ensurePermission, getDefaultRolePermissions, getRolePermissionsMatrix, normalizeRolePermissions } from '../_shared/supabaseAdmin.ts';

type ImportType = 'members' | 'loan-contracts' | 'transactions';

interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

interface LoanOverviewRow {
  loan_amount: number | null;
  outstanding_amount: number | null;
  status: string | null;
}

interface LoanPaymentImportRow {
  external_reference: string;
  paid_date: string;
  contract_no: string;
  member_no: string;
  principal_paid: number;
  interest_paid: number;
  remaining_balance: number;
  note: string | null;
  operator_name: string | null;
  member_name: string | null;
  transaction_status: string | null;
  interest_installments_paid: number;
  overdue_interest_before: number;
  overdue_interest_after: number;
  payment_mode: 'normal' | 'settlement';
  created_by: string | null;
  created_at: string;
}

interface ExistingLoanPaymentMatchRow {
  id: string;
  external_reference: string | null;
  contract_no: string;
  member_no: string;
  paid_date: string;
  principal_paid: number | null;
  interest_paid: number | null;
}

interface LoanReportPaperSettings {
  paper_size: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  margin_mm: number;
  font_scale: number;
  table_width_percent: number;
  table_height_percent: number;
  column_settings: Record<string, { width_mm: number; height_px: number }>;
}

const defaultLoanReportColumnSettings: Record<string, { width_mm: number; height_px: number }> = {
  sequence: { width_mm: 9, height_px: 32 },
  member_no: { width_mm: 14, height_px: 32 },
  member_name: { width_mm: 45, height_px: 32 },
  opening_balance: { width_mm: 22, height_px: 32 },
  principal_paid: { width_mm: 20, height_px: 32 },
  interest_paid: { width_mm: 20, height_px: 32 },
  remaining_balance: { width_mm: 22, height_px: 32 },
  note: { width_mm: 32, height_px: 32 },
};

const defaultLoanReportPaperSettings: LoanReportPaperSettings = {
  paper_size: 'a4',
  orientation: 'portrait',
  margin_mm: 10,
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
  const rawColumnSettings = source.column_settings && typeof source.column_settings === 'object'
    ? source.column_settings as Record<string, unknown>
    : {};
  const columnSettings = Object.keys(defaultLoanReportColumnSettings).reduce<Record<string, { width_mm: number; height_px: number }>>((map, key) => {
    const columnSource = rawColumnSettings[key] && typeof rawColumnSettings[key] === 'object'
      ? rawColumnSettings[key] as Record<string, unknown>
      : {};
    const widthMm = columnSource.width_mm ?? (columnSource.width_px !== undefined ? pxToMm(columnSource.width_px) : defaultLoanReportColumnSettings[key].width_mm);
    map[key] = {
      width_mm: clampNumber(widthMm, defaultLoanReportColumnSettings[key].width_mm, 6, 70),
      height_px: clampNumber(columnSource.height_px, defaultLoanReportColumnSettings[key].height_px, 24, 72),
    };
    return map;
  }, { ...defaultLoanReportColumnSettings });

  return {
    paper_size: source.paper_size === 'letter' ? 'letter' : 'a4',
    orientation: source.orientation === 'landscape' ? 'landscape' : 'portrait',
    margin_mm: clampNumber(source.margin_mm, defaultLoanReportPaperSettings.margin_mm, 6, 25),
    font_scale: clampNumber(source.font_scale, defaultLoanReportPaperSettings.font_scale, 0.85, 1.15),
    table_width_percent: clampNumber(source.table_width_percent, defaultLoanReportPaperSettings.table_width_percent, 70, 100),
    table_height_percent: clampNumber(source.table_height_percent, defaultLoanReportPaperSettings.table_height_percent, 70, 100),
    column_settings: columnSettings,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const source = error as Record<string, unknown>;
    const message = typeof source.message === 'string' ? source.message.trim() : '';
    const details = typeof source.details === 'string' ? source.details.trim() : '';
    const hint = typeof source.hint === 'string' ? source.hint.trim() : '';

    if (message && details) {
      return `${message} (${details})`;
    }

    if (message && hint) {
      return `${message} (${hint})`;
    }

    if (message) {
      return message;
    }
  }

  return 'ไม่สามารถจัดการข้อมูลผู้ใช้งานได้';
}

const FULL_NAME_ALIASES = ['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ และ สกุล', 'ชื่อและสกุล', 'ชื่อ-นามสกุล', 'ชื่อ นามสกุล', 'ชื่อผู้กู้', 'ชื่อผู้กู้สกุล', 'ชื่อผู้กู้-สกุล', 'ชื่อผู้กู้-นามสกุล', 'ชื่อผู้กู้ นามสกุล', 'ชื่อผู้กู้/สกุล', 'ชื่อ-สกุลผู้กู้', 'ชื่อสมาชิก', 'fullname', 'full_name', 'name'];
const KNOWN_TITLES = ['นางสาว', 'เด็กหญิง', 'เด็กชาย', 'นาย', 'นาง'];
const TEMPORARY_GUARANTOR_STATUS = 'ผู้ค้ำชั่วคราว';
const NORMAL_MEMBER_STATUS = 'ปกติ';

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  return tabCount > commaCount ? '\t' : ',';
}

function normalizeHeader(value: string) {
  return value.replace(/\uFEFF/g, '').trim().toLowerCase().replace(/[\s_\-()/]+/g, '');
}

function parseCsv(text: string): ParsedCsv {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(current.trim());
      current = '';
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    throw new Error('ไฟล์ CSV ไม่มีข้อมูล');
  }

  const [headers, ...dataRows] = rows;
  return { headers, rows: dataRows.filter((csvRow) => csvRow.some((cell) => cell.length > 0)) };
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
  return normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
}

function getCell(row: string[], index: number) {
  return index >= 0 ? String(row[index] ?? '').trim() : '';
}

function splitPersonName(fullName: string, currentTitle: string) {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { title: currentTitle.trim(), firstName: '', lastName: '' };
  }

  let working = normalized;
  const inferredTitle = KNOWN_TITLES.find((item) => normalized === item || normalized.startsWith(item)) || '';
  const titleToStrip = currentTitle.trim() || inferredTitle;
  if (titleToStrip && working.startsWith(titleToStrip)) {
    working = working.slice(titleToStrip.length).trim();
  }

  const parts = working.split(' ').filter(Boolean);
  if (parts.length <= 1) {
    return { title: titleToStrip, firstName: parts[0] ?? '', lastName: '' };
  }

  return {
    title: titleToStrip,
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function parseGuarantorValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const matched = trimmed.match(/^\(([^)]+)\)\s*(.*)$/);
  if (!matched) {
    return trimmed;
  }

  return matched[1].trim();
}

function resolveNameParts(row: string[], title: string, firstNameIndex: number, lastNameIndex: number, fullNameIndex: number) {
  const directFirstName = getCell(row, firstNameIndex);
  const directLastName = getCell(row, lastNameIndex);
  const fullName = getCell(row, fullNameIndex) || (!title.trim() && directFirstName && !directLastName ? directFirstName : '');
  const splitName = fullName ? splitPersonName(fullName, title) : { title, firstName: '', lastName: '' };

  if (directFirstName && directLastName) {
    return { title: title || splitName.title, firstName: directFirstName, lastName: directLastName };
  }

  if (!fullName) {
    return { title, firstName: directFirstName, lastName: directLastName };
  }

  return {
    title: title || splitName.title,
    firstName: directFirstName || splitName.firstName,
    lastName: directLastName || splitName.lastName,
  };
}

function parseDecimal(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const number = Number(normalized);
  if (Number.isNaN(number)) {
    throw new Error(`ตัวเลขไม่ถูกต้อง: ${value}`);
  }
  return number;
}

function formatMoneyKey(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

function buildPaymentCompositeKey(input: {
  contract_no: string;
  member_no: string;
  paid_date: string;
  principal_paid: number | null | undefined;
  interest_paid: number | null | undefined;
}) {
  return [
    input.contract_no.trim(),
    input.member_no.trim(),
    input.paid_date.trim(),
    formatMoneyKey(input.principal_paid),
    formatMoneyKey(input.interest_paid),
  ].join('|');
}

function parseDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = trimmed.split(/[ T]/)[0];

  const isoMatch = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return dateOnly;

  const thaiMatch = dateOnly.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (thaiMatch) {
    const day = thaiMatch[1].padStart(2, '0');
    const month = thaiMatch[2].padStart(2, '0');
    const rawYear = Number(thaiMatch[3]);
    const year = rawYear > 2400 ? rawYear - 543 : rawYear;
    return `${year}-${month}-${day}`;
  }

  throw new Error(`วันที่ไม่ถูกต้อง: ${value}`);
}

function parseInteger(value: string, fallback = 0) {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return fallback;
  if (!/^[-+]?\d+$/.test(normalized)) {
    throw new Error(`จำนวนเต็มไม่ถูกต้อง: ${value}`);
  }
  return Number(normalized);
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function detectPaymentMode(status: string, note: string, remainingBalance: number) {
  const combined = `${status} ${note}`.toLowerCase();
  if (combined.includes('กลบหนี้') || combined.includes('settlement')) {
    return 'settlement';
  }

  if (remainingBalance <= 0 && (combined.includes('ปิด') || combined.includes('closed'))) {
    return 'settlement';
  }

  return 'normal';
}

function buildImportedPaymentNote(note: string, status: string, installments: number, principalPaid: number, interestPaid: number, remainingBalance: number) {
  const trimmedNote = note.trim();
  const normalizedNote = trimmedNote === '-' ? '' : trimmedNote;
  if (normalizedNote) {
    return normalizedNote;
  }

  if (detectPaymentMode(status, normalizedNote, remainingBalance) === 'settlement') {
    return 'กลบหนี้';
  }

  if (installments > 1) {
    return `ชำระดอกเบี้ย ${installments} งวด`;
  }

  if (principalPaid > 0 && interestPaid > 0) {
    return 'ชำระต้นพร้อมดอกเบี้ยประจำงวด';
  }

  if (interestPaid > 0) {
    return 'ชำระเฉพาะดอกเบี้ยประจำงวด';
  }

  return null;
}

async function syncLoanBalancesFromPayments(contractNos: string[]) {
  const uniqueContractNos = [...new Set(contractNos.filter(Boolean))];
  if (uniqueContractNos.length === 0) {
    return;
  }

  const { data: contracts, error: contractsError } = await adminClient
    .from('loan_contracts')
    .select('contract_no, status')
    .in('contract_no', uniqueContractNos);

  if (contractsError) throw contractsError;

  const { data: payments, error: paymentsError } = await adminClient
    .from('loan_payments')
    .select('contract_no, paid_date, remaining_balance, transaction_status, created_at')
    .in('contract_no', uniqueContractNos)
    .order('paid_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (paymentsError) throw paymentsError;

  const contractStatusMap = new Map((contracts ?? []).map((item) => [String(item.contract_no), item.status ?? null]));

  const latestByContract = new Map<string, { remaining_balance: number; transaction_status: string | null }>();
  for (const payment of payments ?? []) {
    if (!latestByContract.has(payment.contract_no)) {
      latestByContract.set(payment.contract_no, {
        remaining_balance: Number(payment.remaining_balance ?? 0),
        transaction_status: payment.transaction_status ?? null,
      });
    }
  }

  for (const [contractNo, latest] of latestByContract.entries()) {
    const { error: updateError } = await adminClient
      .from('loan_contracts')
      .update({
        outstanding_amount: latest.remaining_balance,
        status: latest.remaining_balance <= 0
          ? (latest.transaction_status || 'ปิดบัญชี')
          : (latest.transaction_status || contractStatusMap.get(contractNo) || null),
        updated_at: new Date().toISOString(),
      })
      .eq('contract_no', contractNo);

    if (updateError) throw updateError;
  }
}

async function importLoanTransactions(csvText: string) {
  const { headers, rows } = parseCsv(csvText);
  const referenceIndex = findHeaderIndex(headers, ['รหัสอ้างอิง', 'reference_id', 'referenceid', 'external_reference', 'transaction_reference']);
  const paidDateIndex = findHeaderIndex(headers, ['วัน/เดือน/ปี (พ.ศ.)', 'วันเดือนปี(พ.ศ.)', 'วัน/เดือน/ปี', 'วันที่ชำระ', 'paid_date', 'payment_date']);
  const contractNoIndex = findHeaderIndex(headers, ['เลขที่สัญญา', 'contract_no', 'contractno']);
  const memberNoIndex = findHeaderIndex(headers, ['รหัสสมาชิก', 'เลขที่สมาชิก', 'member_no', 'memberno']);
  const principalPaidIndex = findHeaderIndex(headers, ['ชำระเงินต้น', 'principal_paid', 'principal']);
  const interestPaidIndex = findHeaderIndex(headers, ['ชำระดอกเบี้ย', 'interest_paid', 'interest']);
  const remainingBalanceIndex = findHeaderIndex(headers, ['ยอดคงเหลือ', 'remaining_balance', 'balance']);
  const noteIndex = findHeaderIndex(headers, ['หมายเหตุ', 'note', 'remark', 'remarks']);
  const operatorIndex = findHeaderIndex(headers, ['ผู้ทำรายการ', 'operator', 'operator_name', 'processed_by', 'username']);
  const memberNameIndex = findHeaderIndex(headers, ['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ-นามสกุล', 'ชื่อ นามสกุล', 'fullname', 'full_name', 'name']);
  const transactionStatusIndex = findHeaderIndex(headers, ['สถานะการทำรายการ', 'transaction_status', 'payment_status']);
  const installmentsIndex = findHeaderIndex(headers, ['จำนวนงวดดอกที่ชำระ', 'งวดดอกที่ชำระ', 'interest_installments_paid', 'paid_installments']);
  const overdueBeforeIndex = findHeaderIndex(headers, ['ค้างดอกก่อนรับชำระ', 'overdue_interest_before', 'interest_overdue_before']);
  const overdueAfterIndex = findHeaderIndex(headers, ['ค้างดอกหลังรับชำระ', 'overdue_interest_after', 'interest_overdue_after']);

  if ([referenceIndex, paidDateIndex, contractNoIndex, memberNoIndex, principalPaidIndex, interestPaidIndex, remainingBalanceIndex, noteIndex, operatorIndex, memberNameIndex, transactionStatusIndex, installmentsIndex, overdueBeforeIndex, overdueAfterIndex].some((index) => index < 0)) {
    throw new Error('ไฟล์ Transaction ต้องมีคอลัมน์ตามหัวตารางที่กำหนดครบทั้งหมด');
  }

  const operatorValues = [...new Set(rows.map((row) => getCell(row, operatorIndex)).filter(Boolean))];
  const { data: users, error: usersError } = operatorValues.length > 0
    ? await adminClient.from('app_users').select('id, username, title, first_name, last_name')
    : { data: [], error: null };

  if (usersError) throw usersError;

  const operatorMap = new Map<string, string>();
  for (const user of users ?? []) {
    const fullName = `${user.title ?? ''}${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
    const bareName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
    [String(user.username ?? ''), fullName, bareName].forEach((value) => {
      const normalized = normalizeLookupValue(value);
      if (normalized) {
        operatorMap.set(normalized, user.id);
      }
    });
  }

  const payload: LoanPaymentImportRow[] = rows.map((row, rowIndex) => {
    const externalReference = getCell(row, referenceIndex);
    const paidDate = parseDate(getCell(row, paidDateIndex));
    const contractNo = getCell(row, contractNoIndex);
    const memberNo = getCell(row, memberNoIndex);
    const principalPaid = parseDecimal(getCell(row, principalPaidIndex));
    const interestPaid = parseDecimal(getCell(row, interestPaidIndex));
    const remainingBalance = parseDecimal(getCell(row, remainingBalanceIndex));
    const note = getCell(row, noteIndex);
    const operatorName = getCell(row, operatorIndex);
    const memberName = getCell(row, memberNameIndex);
    const transactionStatus = getCell(row, transactionStatusIndex);
    const interestInstallmentsPaid = parseInteger(getCell(row, installmentsIndex), 0);
    const overdueInterestBefore = parseInteger(getCell(row, overdueBeforeIndex), 0);
    const overdueInterestAfter = parseInteger(getCell(row, overdueAfterIndex), 0);
    const paymentMode = detectPaymentMode(transactionStatus, note, remainingBalance);

    if (!externalReference || !paidDate || !contractNo || !memberNo || !memberName) {
      throw new Error(`ข้อมูล Transaction ไม่ครบถ้วนที่แถว ${rowIndex + 2}`);
    }

    return {
      external_reference: externalReference,
      paid_date: paidDate,
      contract_no: contractNo,
      member_no: memberNo,
      principal_paid: principalPaid,
      interest_paid: interestPaid,
      remaining_balance: remainingBalance,
      note: buildImportedPaymentNote(note, transactionStatus, interestInstallmentsPaid, principalPaid, interestPaid, remainingBalance),
      operator_name: operatorName || null,
      member_name: memberName || null,
      transaction_status: transactionStatus || null,
      interest_installments_paid: interestInstallmentsPaid,
      overdue_interest_before: overdueInterestBefore,
      overdue_interest_after: overdueInterestAfter,
      payment_mode: paymentMode,
      created_by: operatorMap.get(normalizeLookupValue(operatorName)) ?? null,
      created_at: new Date().toISOString(),
    };
  });

  const contractNos = [...new Set(payload.map((item) => item.contract_no))];
  const memberNos = [...new Set(payload.map((item) => item.member_no))];
  const paidDates = [...new Set(payload.map((item) => item.paid_date))];
  const [{ data: contracts, error: contractsError }, { data: members, error: membersError }, { data: existing, error: existingError }, { data: existingCandidates, error: existingCandidatesError }] = await Promise.all([
    adminClient.from('loan_contracts').select('contract_no, member_no').in('contract_no', contractNos),
    adminClient.from('members').select('member_no').in('member_no', memberNos),
    adminClient.from('loan_payments').select('external_reference').in('external_reference', payload.map((item) => item.external_reference)),
    adminClient
      .from('loan_payments')
      .select('id, external_reference, contract_no, member_no, paid_date, principal_paid, interest_paid')
      .in('contract_no', contractNos)
      .in('member_no', memberNos)
      .in('paid_date', paidDates),
  ]);

  if (contractsError || membersError || existingError || existingCandidatesError) {
    throw contractsError ?? membersError ?? existingError ?? existingCandidatesError;
  }

  const contractMap = new Map((contracts ?? []).map((item) => [String(item.contract_no), String(item.member_no)]));
  const memberSet = new Set((members ?? []).map((item) => String(item.member_no)));

  for (const item of payload) {
    if (!memberSet.has(item.member_no)) {
      throw new Error(`ไม่พบรหัสสมาชิกในระบบ: ${item.member_no}`);
    }

    const contractMemberNo = contractMap.get(item.contract_no);
    if (!contractMemberNo) {
      throw new Error(`ไม่พบเลขที่สัญญาในระบบ: ${item.contract_no}`);
    }

    if (contractMemberNo !== item.member_no) {
      throw new Error(`เลขที่สัญญา ${item.contract_no} ไม่ได้ผูกกับรหัสสมาชิก ${item.member_no}`);
    }
  }

  const existingSet = new Set((existing ?? []).map((item) => String(item.external_reference)));
  const compositeKeyCount = new Map<string, number>();
  const compositeCandidateMap = new Map<string, ExistingLoanPaymentMatchRow>();

  for (const item of (existingCandidates ?? []) as ExistingLoanPaymentMatchRow[]) {
    const compositeKey = buildPaymentCompositeKey({
      contract_no: item.contract_no,
      member_no: item.member_no,
      paid_date: item.paid_date,
      principal_paid: Number(item.principal_paid ?? 0),
      interest_paid: Number(item.interest_paid ?? 0),
    });
    compositeKeyCount.set(compositeKey, (compositeKeyCount.get(compositeKey) ?? 0) + 1);
    if (!compositeCandidateMap.has(compositeKey)) {
      compositeCandidateMap.set(compositeKey, item);
    }
  }

  const recordsToUpsert: LoanPaymentImportRow[] = [];
  const recordsToMergeById: Array<{ id: string; row: LoanPaymentImportRow }> = [];

  for (const item of payload) {
    if (existingSet.has(item.external_reference)) {
      recordsToUpsert.push(item);
      continue;
    }

    const compositeKey = buildPaymentCompositeKey(item);
    if ((compositeKeyCount.get(compositeKey) ?? 0) === 1) {
      const matchedRecord = compositeCandidateMap.get(compositeKey);
      if (matchedRecord) {
        recordsToMergeById.push({ id: matchedRecord.id, row: item });
        continue;
      }
    }

    recordsToUpsert.push(item);
  }

  for (const entry of recordsToMergeById) {
    const { error: mergeError } = await adminClient
      .from('loan_payments')
      .update({
        contract_no: entry.row.contract_no,
        member_no: entry.row.member_no,
        payment_mode: entry.row.payment_mode,
        paid_date: entry.row.paid_date,
        principal_paid: entry.row.principal_paid,
        interest_paid: entry.row.interest_paid,
        interest_installments_paid: entry.row.interest_installments_paid,
        remaining_balance: entry.row.remaining_balance,
        note: entry.row.note,
        created_by: entry.row.created_by,
        operator_name: entry.row.operator_name,
        member_name: entry.row.member_name,
        transaction_status: entry.row.transaction_status,
        overdue_interest_before: entry.row.overdue_interest_before,
        overdue_interest_after: entry.row.overdue_interest_after,
      })
      .eq('id', entry.id);

    if (mergeError) throw mergeError;
  }

  if (recordsToUpsert.length > 0) {
    const { error: upsertError } = await adminClient.from('loan_payments').upsert(recordsToUpsert, { onConflict: 'external_reference' });
    if (upsertError) throw upsertError;
  }

  const inserted = recordsToUpsert.filter((item) => !existingSet.has(item.external_reference)).length;
  const updated = payload.length - inserted;

  await syncLoanBalancesFromPayments(contractNos);

  return { total: payload.length, inserted, updated };
}

function isActiveStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  if (!normalized) return true;
  return !['ลาออก', 'ยกเลิก', 'ปิด', 'inactive', 'cancelled', 'closed'].some((value) => normalized.includes(value));
}

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

async function importMembers(csvText: string) {
  const { headers, rows } = parseCsv(csvText);
  const memberNoIndex = findHeaderIndex(headers, ['เลขที่สมาชิก', 'รหัสสมาชิก', 'member_no', 'memberno']);
  const titleIndex = findHeaderIndex(headers, ['คำนำหน้าชื่อ', 'คำนำหน้า', 'title']);
  const firstNameIndex = findHeaderIndex(headers, ['ชื่อ', 'first_name', 'firstname']);
  const lastNameIndex = findHeaderIndex(headers, ['สกุล', 'นามสกุล', 'last_name', 'lastname']);
  const fullNameIndex = findHeaderIndex(headers, FULL_NAME_ALIASES);
  const statusIndex = findHeaderIndex(headers, ['สถานะ', 'status']);

  if ([memberNoIndex, statusIndex].some((index) => index < 0) || (titleIndex < 0 && fullNameIndex < 0) || ((firstNameIndex < 0 || lastNameIndex < 0) && fullNameIndex < 0)) {
    throw new Error('ไฟล์ฐานข้อมูลสมาชิกต้องมีคอลัมน์ เลขที่สมาชิก, สถานะ และอย่างน้อย คำนำหน้า+ชื่อ+สกุล แบบแยกคอลัมน์ หรือรวมอยู่ในคอลัมน์ ชื่อ-สกุล');
  }

  const payload = rows.map((row, rowIndex) => {
    const memberNo = getCell(row, memberNoIndex);
    const title = getCell(row, titleIndex);
    const { title: resolvedTitle, firstName, lastName } = resolveNameParts(row, title, firstNameIndex, lastNameIndex, fullNameIndex);
    const status = getCell(row, statusIndex);

    if (!memberNo || !resolvedTitle || !firstName || !lastName) {
      throw new Error(`ข้อมูลสมาชิกไม่ครบถ้วนที่แถว ${rowIndex + 2}`);
    }

    return {
      member_no: memberNo,
      title: resolvedTitle,
      first_name: firstName,
      last_name: lastName,
      legacy_status: status,
      active: isActiveStatus(status),
      updated_at: new Date().toISOString(),
    };
  });

  const memberNos = payload.map((item) => item.member_no);
  const { data: existing, error: existingError } = await adminClient
    .from('members')
    .select('member_no')
    .in('member_no', memberNos);

  if (existingError) throw existingError;

  const existingSet = new Set((existing ?? []).map((item) => item.member_no));
  const inserted = payload.filter((item) => !existingSet.has(item.member_no)).length;
  const updated = payload.length - inserted;

  const { error } = await adminClient.from('members').upsert(payload, { onConflict: 'member_no' });
  if (error) throw error;

  for (const member of payload) {
    await reconcileTemporaryGuarantors(member);
  }

  return { total: payload.length, inserted, updated };
}

async function importLoanContracts(csvText: string) {
  const { headers, rows } = parseCsv(csvText);
  const memberNoIndex = findHeaderIndex(headers, ['เลขที่สมาชิก', 'รหัสสมาชิก', 'member_no', 'memberno']);
  const contractNoIndex = findHeaderIndex(headers, ['เลขที่สัญญา', 'contract_no', 'contractno']);
  const titleIndex = findHeaderIndex(headers, ['คำนำหน้าชื่อ', 'คำหนำหน้าชื่อ', 'คำนำหน้า', 'title']);
  const firstNameIndex = findHeaderIndex(headers, ['ชื่อ', 'first_name', 'firstname']);
  const lastNameIndex = findHeaderIndex(headers, ['สกุล', 'นามสกุล', 'last_name', 'lastname']);
  const fullNameIndex = findHeaderIndex(headers, FULL_NAME_ALIASES);
  const loanAmountIndex = findHeaderIndex(headers, ['ยอดเงินกู้', 'loan_amount', 'loanamount']);
  const outstandingAmountIndex = findHeaderIndex(headers, ['ยอดคงค้าง', 'outstanding_amount', 'outstandingamount']);
  const statusIndex = findHeaderIndex(headers, ['สถานะ', 'status']);
  const contractDateIndex = findHeaderIndex(headers, ['วันที่สร้างสัญญา', 'วันที่ทำสัญญา', 'contract_date', 'created_at']);
  const guarantor1Index = findHeaderIndex(headers, ['ผู้ค้ำประกันคนที่1', 'ผู้ค้ำประกันคนที่ 1', 'ผู้ค้ำประกัน1', 'ผู้ค้ำประกัน 1', 'ผู้ค้ำที่1', 'ผู้ค้ำที่ 1', 'ผู้ค้ำ1', 'ผู้ค้ำ 1', 'ชื่อผู้ค้ำคนที่1', 'ชื่อผู้ค้ำคนที่ 1', 'guarantor_1', 'guarantor1']);
  const guarantor2Index = findHeaderIndex(headers, ['ผู้ค้ำประกันคนที่2', 'ผู้ค้ำประกันคนที่ 2', 'ผู้ค้ำประกัน2', 'ผู้ค้ำประกัน 2', 'ผู้ค้ำที่2', 'ผู้ค้ำที่ 2', 'ผู้ค้ำ2', 'ผู้ค้ำ 2', 'ชื่อผู้ค้ำคนที่2', 'ชื่อผู้ค้ำคนที่ 2', 'guarantor_2', 'guarantor2']);

  if ([memberNoIndex, contractNoIndex, loanAmountIndex, outstandingAmountIndex, statusIndex, contractDateIndex, guarantor1Index].some((index) => index < 0) || (firstNameIndex < 0 && fullNameIndex < 0)) {
    throw new Error('ไฟล์สัญญาเงินกู้ต้องมีคอลัมน์ เลขที่สมาชิก, เลขที่สัญญา, ยอดเงินกู้, ยอดคงค้าง, สถานะ, วันที่สร้างสัญญา, ผู้ค้ำประกันคนที่ 1 และอย่างน้อยคอลัมน์ชื่อผู้กู้ 1 ช่อง เช่น ชื่อ, ชื่อผู้กู้ หรือ ชื่อ-สกุล');
  }

  const payload = rows.map((row, rowIndex) => {
    const memberNo = getCell(row, memberNoIndex);
    const contractNo = getCell(row, contractNoIndex);
    const title = getCell(row, titleIndex);
    const { title: resolvedTitle, firstName, lastName } = resolveNameParts(row, title, firstNameIndex, lastNameIndex, fullNameIndex);
    const guarantor1 = parseGuarantorValue(getCell(row, guarantor1Index));
    const guarantor2 = guarantor2Index >= 0 ? parseGuarantorValue(getCell(row, guarantor2Index)) : '';

    if (!memberNo || !contractNo || (!firstName && !lastName) || !guarantor1) {
      throw new Error(`ข้อมูลสัญญาเงินกู้ไม่ครบถ้วนที่แถว ${rowIndex + 2}`);
    }

    return {
      member_no: memberNo,
      contract_no: contractNo,
      title: resolvedTitle || '',
      first_name: firstName || lastName,
      last_name: firstName ? lastName : '',
      loan_amount: parseDecimal(getCell(row, loanAmountIndex)),
      outstanding_amount: parseDecimal(getCell(row, outstandingAmountIndex)),
      status: getCell(row, statusIndex),
      contract_date: parseDate(getCell(row, contractDateIndex)),
      guarantor_1: guarantor1,
      guarantor_2: guarantor2 || null,
      updated_at: new Date().toISOString(),
    };
  });

  const memberNos = [...new Set(payload.map((item) => item.member_no))];
  const { data: members, error: memberError } = await adminClient
    .from('members')
    .select('member_no')
    .in('member_no', memberNos);

  if (memberError) throw memberError;

  const memberSet = new Set((members ?? []).map((item) => item.member_no));
  const missingMembers = memberNos.filter((memberNo) => !memberSet.has(memberNo));
  if (missingMembers.length > 0) {
    throw new Error(`ไม่พบสมาชิกในระบบสำหรับสัญญาเลขที่สมาชิก: ${missingMembers.slice(0, 10).join(', ')}`);
  }

  const contractNos = payload.map((item) => item.contract_no);
  const { data: existing, error: existingError } = await adminClient
    .from('loan_contracts')
    .select('contract_no')
    .in('contract_no', contractNos);

  if (existingError) throw existingError;

  const existingSet = new Set((existing ?? []).map((item) => item.contract_no));
  const inserted = payload.filter((item) => !existingSet.has(item.contract_no)).length;
  const updated = payload.length - inserted;

  const { error } = await adminClient.from('loan_contracts').upsert(payload, { onConflict: 'contract_no' });
  if (error) throw error;

  return { total: payload.length, inserted, updated };
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    const userProfile = await ensurePermission(accessToken, 'access_devmanager');

    if (request.method === 'GET') {
      const [
        { data: users, error: usersError },
        { data: settings, error: settingsError },
        { count: membersCount, error: membersCountError },
        { count: activeMembersCount, error: activeMembersCountError },
        { count: contractsCount, error: contractsCountError },
        { count: paymentsCount, error: paymentsCountError },
        { data: loanRows, error: loanRowsError },
      ] = await Promise.all([
        adminClient
          .from('app_users')
          .select('id, member_no, title, first_name, last_name, username, role, approval_status')
          .order('created_at', { ascending: false }),
        adminClient.from('app_settings').select('group_name, notice, allow_registration, role_permissions, loan_report_paper_settings').eq('id', 1).single(),
        adminClient.from('members').select('*', { count: 'exact', head: true }),
        adminClient.from('members').select('*', { count: 'exact', head: true }).eq('active', true),
        adminClient.from('loan_contracts').select('*', { count: 'exact', head: true }),
        adminClient.from('loan_payments').select('*', { count: 'exact', head: true }),
        adminClient.from('loan_contracts').select('loan_amount, outstanding_amount, status'),
      ]);

      if (usersError || settingsError || membersCountError || activeMembersCountError || contractsCountError || paymentsCountError || loanRowsError) {
        throw usersError ?? settingsError ?? membersCountError ?? activeMembersCountError ?? contractsCountError ?? paymentsCountError ?? loanRowsError;
      }

      const usersList = users ?? [];
      const pendingUsers = usersList.filter((user) => user.approval_status === 'pending').length;
      const approvedUsers = usersList.filter((user) => user.approval_status === 'approved').length;
      const devAdmins = usersList.filter((user) => user.role === 'dev_admin').length;
      const officerUsers = usersList.filter((user) => user.role === 'officer').length;
      const adminUsers = usersList.filter((user) => user.role === 'admin').length;
      const loans = (loanRows ?? []) as LoanOverviewRow[];
      const totalLoanAmount = loans.reduce((sum, loan) => sum + Number(loan.loan_amount ?? 0), 0);
      const totalOutstandingAmount = loans.reduce((sum, loan) => sum + Number(loan.outstanding_amount ?? 0), 0);
      const activeLoanContracts = loans.filter((loan) => Number(loan.outstanding_amount ?? 0) > 0).length;
      const closedLoanContracts = loans.filter((loan) => {
        const normalizedStatus = String(loan.status ?? '').trim().toLowerCase();
        return normalizedStatus.includes('ปิด') || normalizedStatus.includes('closed') || Number(loan.outstanding_amount ?? 0) <= 0;
      }).length;

      const rolePermissions = normalizeRolePermissions(settings?.role_permissions ?? getDefaultRolePermissions());
      const loanReportPaperSettings = normalizeLoanReportPaperSettings(settings?.loan_report_paper_settings);

      return jsonResponse({
        success: true,
        data: {
          users: usersList,
          settings: {
            group_name: settings.group_name,
            notice: settings.notice,
            allow_registration: settings.allow_registration,
            role_permissions: rolePermissions,
            loan_report_paper_settings: loanReportPaperSettings,
          },
          import_stats: {
            members_count: membersCount ?? 0,
            loan_contracts_count: contractsCount ?? 0,
            loan_payments_count: paymentsCount ?? 0,
          },
          overview: {
            members_count: membersCount ?? 0,
            active_members_count: activeMembersCount ?? 0,
            inactive_members_count: Math.max((membersCount ?? 0) - (activeMembersCount ?? 0), 0),
            users_count: usersList.length,
            approved_users_count: approvedUsers,
            pending_users_count: pendingUsers,
            dev_admin_users_count: devAdmins,
            officer_users_count: officerUsers,
            admin_users_count: adminUsers,
            loan_contracts_count: contractsCount ?? 0,
            active_loan_contracts_count: activeLoanContracts,
            closed_loan_contracts_count: closedLoanContracts,
            total_loan_amount: totalLoanAmount,
            total_outstanding_amount: totalOutstandingAmount,
          },
        },
      });
    }

    if (request.method === 'POST') {
      const { importType, csvText } = await request.json() as { importType?: ImportType; csvText?: string };

      if (!importType || !['members', 'loan-contracts', 'transactions'].includes(importType)) {
        return jsonResponse({ success: false, message: 'ประเภทการนำเข้าไม่ถูกต้อง' }, 400);
      }

      if (!csvText || !String(csvText).trim()) {
        return jsonResponse({ success: false, message: 'กรุณาเลือกไฟล์ CSV ที่มีข้อมูล' }, 400);
      }

      const result = importType === 'members'
        ? await importMembers(csvText)
        : importType === 'loan-contracts'
          ? await importLoanContracts(csvText)
          : await importLoanTransactions(csvText);

      return jsonResponse({
        success: true,
        message: `นำเข้าข้อมูล${importType === 'members' ? 'สมาชิก' : importType === 'loan-contracts' ? 'สัญญาเงินกู้' : 'ธุรกรรมรับชำระ'}เรียบร้อย ${result.total} รายการ (เพิ่ม ${result.inserted}, อัปเดต ${result.updated})`,
        data: result,
      });
    }

    if (request.method === 'PATCH') {
      const { userId, approvalStatus, role } = await request.json();

      if (!['pending', 'approved', 'rejected'].includes(approvalStatus)) {
        return jsonResponse({ success: false, message: 'สถานะไม่ถูกต้อง' }, 400);
      }

      if (!['member', 'officer', 'admin', 'dev_admin'].includes(role)) {
        return jsonResponse({ success: false, message: 'สิทธิ์ผู้ใช้ไม่ถูกต้อง' }, 400);
      }

      const { data: targetUser, error: targetUserError } = await adminClient
        .from('app_users')
        .select('id, role, approval_status')
        .eq('id', userId)
        .single();

      if (targetUserError || !targetUser) {
        return jsonResponse({ success: false, message: 'ไม่พบผู้ใช้งานที่ต้องการแก้ไขสิทธิ์' }, 404);
      }

      if (targetUser.id === userProfile.id) {
        return jsonResponse({ success: false, message: 'ไม่สามารถเลื่อนหรือลดระดับสิทธิ์ของตนเองได้' }, 403);
      }

      if (!canManageRole(userProfile.role, targetUser.role, role)) {
        return jsonResponse({ success: false, message: 'คุณเปลี่ยนสิทธิ์ได้เฉพาะผู้ใช้ที่มีระดับต่ำกว่าคุณ และระดับปลายทางต้องต่ำกว่าคุณเสมอ' }, 403);
      }

      if (role === 'dev_admin' && userProfile.role !== 'dev_admin') {
        return jsonResponse({ success: false, message: 'เฉพาะ DevManager เท่านั้นที่กำหนด DevManager ได้' }, 403);
      }

      const { error } = await adminClient
        .from('app_users')
        .update({
          approval_status: approvalStatus,
          role,
          approved_at: approvalStatus === 'approved' ? new Date().toISOString() : null,
          approved_by: userProfile.auth_user_id,
        })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      return jsonResponse({ success: true, message: 'อัปเดตสถานะผู้ใช้งานเรียบร้อย' });
    }

    if (request.method === 'PUT') {
      const settings = await request.json();

      const isDevAdmin = userProfile.role === 'dev_admin';
      const { data: currentSettings, error: currentSettingsError } = await adminClient
        .from('app_settings')
        .select('loan_report_paper_settings')
        .eq('id', 1)
        .single();

      if (currentSettingsError) {
        throw currentSettingsError;
      }

      const nextRolePermissions = normalizeRolePermissions(settings.role_permissions ?? getDefaultRolePermissions());
      const nextLoanReportPaperSettings = normalizeLoanReportPaperSettings(settings.loan_report_paper_settings ?? currentSettings?.loan_report_paper_settings);

      if (!nextRolePermissions.dev_admin.access_devmanager) {
        return jsonResponse({ success: false, message: 'ระดับ 1 ต้องมีสิทธิ์เข้าหน้า DevManager เสมอ เพื่อไม่ให้ระบบล็อกผู้ดูแลออกจากหน้าตั้งค่า' }, 400);
      }

      if (settings.role_permissions && !isDevAdmin) {
        return jsonResponse({ success: false, message: 'เฉพาะ DevManager เท่านั้นที่ตั้งค่าสิทธิ์ของแต่ละบทบาทได้' }, 403);
      }

      const currentMatrix = await getRolePermissionsMatrix();

      const { error } = await adminClient.from('app_settings').upsert({
        id: 1,
        group_name: settings.group_name,
        notice: settings.notice,
        allow_registration: settings.allow_registration,
        role_permissions: isDevAdmin ? nextRolePermissions : currentMatrix,
        loan_report_paper_settings: nextLoanReportPaperSettings,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      return jsonResponse({ success: true, message: 'บันทึกการตั้งค่าเรียบร้อย' });
    }

    return jsonResponse({ success: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    const message = getErrorMessage(error);
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400;
    return jsonResponse({ success: false, message }, status);
  }
});