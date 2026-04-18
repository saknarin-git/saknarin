import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, toAuthEmail } from '../_shared/supabaseAdmin.ts';

const allowedTitles = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const { member_no, title, first_name, last_name, username, password } = await request.json();

    if (!member_no || !username || !password || !first_name || !last_name || !allowedTitles.includes(title)) {
      return jsonResponse({ success: false, message: 'กรอกข้อมูลให้ครบถ้วน' }, 400);
    }

    if (String(password).length < 6) {
      return jsonResponse({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, 400);
    }

    const { data: settings } = await adminClient.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (settings && settings.allow_registration === false) {
      return jsonResponse({ success: false, message: 'ระบบปิดรับสมัครสมาชิกชั่วคราว' }, 403);
    }

    const cleanUsername = String(username).trim().toLowerCase();

    const { data: exists } = await adminClient
      .from('app_users')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (exists) {
      return jsonResponse({ success: false, message: 'Username นี้ถูกใช้งานแล้ว' }, 409);
    }

    const { data: member, error: memberError } = await adminClient
      .from('members')
      .select('member_no, title, first_name, last_name')
      .eq('member_no', member_no)
      .eq('title', title)
      .ilike('first_name', String(first_name).trim())
      .ilike('last_name', String(last_name).trim())
      .maybeSingle();

    if (memberError || !member) {
      return jsonResponse({ success: false, message: 'ไม่พบข้อมูลสมาชิกในระบบ' }, 404);
    }

    const { data: alreadyLinked } = await adminClient
      .from('app_users')
      .select('id')
      .eq('member_no', member_no)
      .maybeSingle();

    if (alreadyLinked) {
      return jsonResponse({ success: false, message: 'สมาชิกเลขที่นี้ถูกลงทะเบียนแล้ว' }, 409);
    }

    const email = toAuthEmail(cleanUsername);

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        member_no,
      },
    });

    if (authError || !authData.user) {
      return jsonResponse({ success: false, message: authError?.message ?? 'สร้างบัญชีไม่สำเร็จ' }, 400);
    }

    const { error: insertError } = await adminClient.from('app_users').insert({
      auth_user_id: authData.user.id,
      member_no,
      title,
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      username: cleanUsername,
      role: 'member',
      approval_status: 'pending',
    });

    if (insertError) {
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return jsonResponse({ success: false, message: insertError.message }, 400);
    }

    return jsonResponse({
      success: true,
      message: 'สมัครสมาชิกสำเร็จแล้ว กรุณารอผู้ดูแลระบบอนุมัติบัญชี',
    });
  } catch (error) {
    return jsonResponse(
      { success: false, message: error instanceof Error ? error.message : 'สมัครสมาชิกไม่สำเร็จ' },
      400,
    );
  }
});