import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, ensureAdmin } from '../_shared/supabaseAdmin.ts';

type ResourceType = 'members' | 'loans';

function getResourceType(value: string | null): ResourceType {
  if (value === 'members' || value === 'loans') {
    return value;
  }

  throw new Error('resource ไม่ถูกต้อง');
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

async function listMembers(search: string) {
  let query = adminClient
    .from('members')
    .select('member_no, title, first_name, last_name, legacy_status, active, created_at, updated_at')
    .order('member_no', { ascending: true })
    .limit(200);

  if (search) {
    query = query.or(`member_no.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }

  const { data: members, error } = await query;
  if (error) throw error;

  const memberNos = (members ?? []).map((item) => item.member_no);

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

  (users ?? []).forEach((item) => {
    userCountMap.set(item.member_no, (userCountMap.get(item.member_no) ?? 0) + 1);
  });

  (loans ?? []).forEach((item) => {
    loanCountMap.set(item.member_no, (loanCountMap.get(item.member_no) ?? 0) + 1);
  });

  return (members ?? []).map((member) => ({
    ...member,
    linked_users: userCountMap.get(member.member_no) ?? 0,
    loan_contracts: loanCountMap.get(member.member_no) ?? 0,
  }));
}

async function listLoans(search: string) {
  let query = adminClient
    .from('loan_contracts')
    .select('contract_no, member_no, title, first_name, last_name, loan_amount, outstanding_amount, status, contract_date, guarantor_1, guarantor_2, created_at, updated_at')
    .order('contract_date', { ascending: false, nullsFirst: false })
    .limit(200);

  if (search) {
    query = query.or(`contract_no.ilike.%${search}%,member_no.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,status.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
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
    const adminProfile = await ensureAdmin(accessToken);
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const resource = getResourceType(url.searchParams.get('resource'));
      const search = url.searchParams.get('search')?.trim() ?? '';

      if (resource === 'members') {
        const members = await listMembers(search);
        return jsonResponse({ success: true, data: { members } });
      }

      const loans = await listLoans(search);
      return jsonResponse({ success: true, data: { loans } });
    }

    if (request.method === 'PUT') {
      const { resource, ...payload } = await request.json() as Record<string, unknown> & { resource?: ResourceType };
      const resourceType = getResourceType(resource ?? null);

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

      if (resourceType === 'members') {
        await deleteMember(String(memberNo ?? '').trim(), adminProfile.member_no);
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