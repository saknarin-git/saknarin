import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, ensureAdmin } from '../_shared/supabaseAdmin.ts';

type ImportType = 'members' | 'loan-contracts';

interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

interface LoanOverviewRow {
  loan_amount: number | null;
  outstanding_amount: number | null;
  status: string | null;
}

function normalizeHeader(value: string) {
  return value.replace(/\uFEFF/g, '').trim().toLowerCase().replace(/[\s_\-()/]+/g, '');
}

function parseCsv(text: string): ParsedCsv {
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

    if (char === ',' && !inQuotes) {
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

function parseDecimal(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const number = Number(normalized);
  if (Number.isNaN(number)) {
    throw new Error(`ตัวเลขไม่ถูกต้อง: ${value}`);
  }
  return number;
}

function parseDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  const thaiMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (thaiMatch) {
    const day = thaiMatch[1].padStart(2, '0');
    const month = thaiMatch[2].padStart(2, '0');
    const rawYear = Number(thaiMatch[3]);
    const year = rawYear > 2400 ? rawYear - 543 : rawYear;
    return `${year}-${month}-${day}`;
  }

  throw new Error(`วันที่ไม่ถูกต้อง: ${value}`);
}

function isActiveStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  if (!normalized) return true;
  return !['ลาออก', 'ยกเลิก', 'ปิด', 'inactive', 'cancelled', 'closed'].some((value) => normalized.includes(value));
}

async function importMembers(csvText: string) {
  const { headers, rows } = parseCsv(csvText);
  const memberNoIndex = findHeaderIndex(headers, ['เลขที่สมาชิก', 'รหัสสมาชิก', 'member_no', 'memberno']);
  const titleIndex = findHeaderIndex(headers, ['คำนำหน้าชื่อ', 'คำนำหน้า', 'title']);
  const firstNameIndex = findHeaderIndex(headers, ['ชื่อ', 'first_name', 'firstname']);
  const lastNameIndex = findHeaderIndex(headers, ['สกุล', 'นามสกุล', 'last_name', 'lastname']);
  const statusIndex = findHeaderIndex(headers, ['สถานะ', 'status']);

  if ([memberNoIndex, titleIndex, firstNameIndex, lastNameIndex, statusIndex].some((index) => index < 0)) {
    throw new Error('ไฟล์ฐานข้อมูลสมาชิกต้องมีคอลัมน์ เลขที่สมาชิก, คำนำหน้าชื่อ, ชื่อ, สกุล, สถานะ');
  }

  const payload = rows.map((row, rowIndex) => {
    const memberNo = getCell(row, memberNoIndex);
    const title = getCell(row, titleIndex);
    const firstName = getCell(row, firstNameIndex);
    const lastName = getCell(row, lastNameIndex);
    const status = getCell(row, statusIndex);

    if (!memberNo || !title || !firstName || !lastName) {
      throw new Error(`ข้อมูลสมาชิกไม่ครบถ้วนที่แถว ${rowIndex + 2}`);
    }

    return {
      member_no: memberNo,
      title,
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

  return { total: payload.length, inserted, updated };
}

async function importLoanContracts(csvText: string) {
  const { headers, rows } = parseCsv(csvText);
  const memberNoIndex = findHeaderIndex(headers, ['เลขที่สมาชิก', 'member_no', 'memberno']);
  const contractNoIndex = findHeaderIndex(headers, ['เลขที่สัญญา', 'contract_no', 'contractno']);
  const titleIndex = findHeaderIndex(headers, ['คำนำหน้าชื่อ', 'คำหนำหน้าชื่อ', 'คำนำหน้า', 'title']);
  const firstNameIndex = findHeaderIndex(headers, ['ชื่อ', 'first_name', 'firstname']);
  const lastNameIndex = findHeaderIndex(headers, ['สกุล', 'นามสกุล', 'last_name', 'lastname']);
  const loanAmountIndex = findHeaderIndex(headers, ['ยอดเงินกู้', 'loan_amount', 'loanamount']);
  const outstandingAmountIndex = findHeaderIndex(headers, ['ยอดคงค้าง', 'outstanding_amount', 'outstandingamount']);
  const statusIndex = findHeaderIndex(headers, ['สถานะ', 'status']);
  const contractDateIndex = findHeaderIndex(headers, ['วันที่สร้างสัญญา', 'วันที่ทำสัญญา', 'contract_date', 'created_at']);
  const guarantor1Index = findHeaderIndex(headers, ['ผู้ค้ำประกันคนที่1', 'ผู้ค้ำประกันคนที่ 1', 'guarantor_1', 'guarantor1']);
  const guarantor2Index = findHeaderIndex(headers, ['ผู้ค้ำประกันคนที่2', 'ผู้ค้ำประกันคนที่ 2', 'guarantor_2', 'guarantor2']);

  if ([memberNoIndex, contractNoIndex, titleIndex, firstNameIndex, lastNameIndex, loanAmountIndex, outstandingAmountIndex, statusIndex, contractDateIndex, guarantor1Index].some((index) => index < 0)) {
    throw new Error('ไฟล์สัญญาเงินกู้ต้องมีคอลัมน์ เลขที่สมาชิก, เลขที่สัญญา, คำนำหน้าชื่อ, ชื่อ, สกุล, ยอดเงินกู้, ยอดคงค้าง, สถานะ, วันที่สร้างสัญญา, ผู้ค้ำประกันคนที่ 1');
  }

  const payload = rows.map((row, rowIndex) => {
    const memberNo = getCell(row, memberNoIndex);
    const contractNo = getCell(row, contractNoIndex);
    const title = getCell(row, titleIndex);
    const firstName = getCell(row, firstNameIndex);
    const lastName = getCell(row, lastNameIndex);
    const guarantor1 = getCell(row, guarantor1Index);

    if (!memberNo || !contractNo || !title || !firstName || !lastName || !guarantor1) {
      throw new Error(`ข้อมูลสัญญาเงินกู้ไม่ครบถ้วนที่แถว ${rowIndex + 2}`);
    }

    return {
      member_no: memberNo,
      contract_no: contractNo,
      title,
      first_name: firstName,
      last_name: lastName,
      loan_amount: parseDecimal(getCell(row, loanAmountIndex)),
      outstanding_amount: parseDecimal(getCell(row, outstandingAmountIndex)),
      status: getCell(row, statusIndex),
      contract_date: parseDate(getCell(row, contractDateIndex)),
      guarantor_1: guarantor1,
      guarantor_2: guarantor2Index >= 0 ? getCell(row, guarantor2Index) || null : null,
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
    const adminProfile = await ensureAdmin(accessToken);

    if (request.method === 'GET') {
      const [
        { data: users, error: usersError },
        { data: settings, error: settingsError },
        { count: membersCount, error: membersCountError },
        { count: activeMembersCount, error: activeMembersCountError },
        { count: contractsCount, error: contractsCountError },
        { data: loanRows, error: loanRowsError },
      ] = await Promise.all([
        adminClient
          .from('app_users')
          .select('id, member_no, title, first_name, last_name, username, role, approval_status')
          .order('created_at', { ascending: false }),
        adminClient.from('app_settings').select('group_name, notice, allow_registration').eq('id', 1).single(),
        adminClient.from('members').select('*', { count: 'exact', head: true }),
        adminClient.from('members').select('*', { count: 'exact', head: true }).eq('active', true),
        adminClient.from('loan_contracts').select('*', { count: 'exact', head: true }),
        adminClient.from('loan_contracts').select('loan_amount, outstanding_amount, status'),
      ]);

      if (usersError || settingsError || membersCountError || activeMembersCountError || contractsCountError || loanRowsError) {
        throw usersError ?? settingsError ?? membersCountError ?? activeMembersCountError ?? contractsCountError ?? loanRowsError;
      }

      const usersList = users ?? [];
      const pendingUsers = usersList.filter((user) => user.approval_status === 'pending').length;
      const approvedUsers = usersList.filter((user) => user.approval_status === 'approved').length;
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

      return jsonResponse({
        success: true,
        data: {
          users: usersList,
          settings,
          import_stats: {
            members_count: membersCount ?? 0,
            loan_contracts_count: contractsCount ?? 0,
          },
          overview: {
            members_count: membersCount ?? 0,
            active_members_count: activeMembersCount ?? 0,
            inactive_members_count: Math.max((membersCount ?? 0) - (activeMembersCount ?? 0), 0),
            users_count: usersList.length,
            approved_users_count: approvedUsers,
            pending_users_count: pendingUsers,
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

      if (!importType || !['members', 'loan-contracts'].includes(importType)) {
        return jsonResponse({ success: false, message: 'ประเภทการนำเข้าไม่ถูกต้อง' }, 400);
      }

      if (!csvText || !String(csvText).trim()) {
        return jsonResponse({ success: false, message: 'กรุณาเลือกไฟล์ CSV ที่มีข้อมูล' }, 400);
      }

      const result = importType === 'members'
        ? await importMembers(csvText)
        : await importLoanContracts(csvText);

      return jsonResponse({
        success: true,
        message: `นำเข้าข้อมูล${importType === 'members' ? 'สมาชิก' : 'สัญญาเงินกู้'}เรียบร้อย ${result.total} รายการ (เพิ่ม ${result.inserted}, อัปเดต ${result.updated})`,
        data: result,
      });
    }

    if (request.method === 'PATCH') {
      const { userId, approvalStatus, role } = await request.json();

      if (!['pending', 'approved', 'rejected'].includes(approvalStatus)) {
        return jsonResponse({ success: false, message: 'สถานะไม่ถูกต้อง' }, 400);
      }

      if (!['member', 'officer', 'admin'].includes(role)) {
        return jsonResponse({ success: false, message: 'สิทธิ์ผู้ใช้ไม่ถูกต้อง' }, 400);
      }

      const { error } = await adminClient
        .from('app_users')
        .update({
          approval_status: approvalStatus,
          role,
          approved_at: approvalStatus === 'approved' ? new Date().toISOString() : null,
          approved_by: adminProfile.auth_user_id,
        })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      return jsonResponse({ success: true, message: 'อัปเดตสถานะผู้ใช้งานเรียบร้อย' });
    }

    if (request.method === 'PUT') {
      const settings = await request.json();

      const { error } = await adminClient.from('app_settings').upsert({
        id: 1,
        group_name: settings.group_name,
        notice: settings.notice,
        allow_registration: settings.allow_registration,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      return jsonResponse({ success: true, message: 'บันทึกการตั้งค่าเรียบร้อย' });
    }

    return jsonResponse({ success: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ไม่สามารถจัดการข้อมูลผู้ใช้งานได้';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400;
    return jsonResponse({ success: false, message }, status);
  }
});