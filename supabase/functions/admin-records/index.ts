import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, ensurePermission } from '../_shared/supabaseAdmin.ts';

type ResourceType = 'members' | 'loans';

function parsePage(value: string | null, fallback: number) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback;
  }

  return Math.floor(numeric);
}

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

function createPagination(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
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

  return {
    members: (members ?? []).map((member) => ({
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
    .select('contract_no, member_no, title, first_name, last_name, loan_amount, outstanding_amount, status, contract_date, guarantor_1, guarantor_2, created_at, updated_at', { count: 'exact' })
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

async function createLoan(payload: Record<string, unknown>) {
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
      await ensurePermission(accessToken, resource === 'members' ? 'manage_members' : 'manage_loans');
      const search = url.searchParams.get('search')?.trim() ?? '';
      const page = parsePage(url.searchParams.get('page'), 1);
      const pageSize = parsePage(url.searchParams.get('pageSize'), 20);
      const status = url.searchParams.get('status')?.trim() ?? '';

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