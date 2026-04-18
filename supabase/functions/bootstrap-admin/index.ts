import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, toAuthEmail } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const bootstrapToken = request.headers.get('x-bootstrap-token');
    const expectedToken = Deno.env.get('BOOTSTRAP_ADMIN_TOKEN');

    if (!bootstrapToken || !expectedToken || bootstrapToken !== expectedToken) {
      return jsonResponse({ success: false, message: 'Bootstrap token ไม่ถูกต้อง' }, 401);
    }

    const { data: adminExists } = await adminClient
      .from('app_users')
      .select('id')
      .eq('role', 'dev_admin')
      .eq('approval_status', 'approved')
      .maybeSingle();

    if (adminExists) {
      return jsonResponse({ success: false, message: 'มีผู้ดูแลระบบในระบบแล้ว' }, 409);
    }

    const { member_no, title, first_name, last_name, username, password } = await request.json();
    const cleanUsername = String(username).trim().toLowerCase();

    const { data: member } = await adminClient
      .from('members')
      .select('member_no')
      .eq('member_no', member_no)
      .maybeSingle();

    if (!member) {
      return jsonResponse({ success: false, message: 'ไม่พบเลขสมาชิกในตาราง members' }, 404);
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: toAuthEmail(cleanUsername),
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return jsonResponse({ success: false, message: authError?.message ?? 'สร้าง admin ไม่สำเร็จ' }, 400);
    }

    const { error: insertError } = await adminClient.from('app_users').insert({
      auth_user_id: authData.user.id,
      member_no,
      title,
      first_name,
      last_name,
      username: cleanUsername,
      role: 'dev_admin',
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
    });

    if (insertError) {
      await adminClient.auth.admin.deleteUser(authData.user.id);
      throw insertError;
    }

    return jsonResponse({ success: true, message: 'สร้างผู้ดูแลระบบเริ่มต้นเรียบร้อย' });
  } catch (error) {
    return jsonResponse(
      { success: false, message: error instanceof Error ? error.message : 'สร้างผู้ดูแลระบบไม่สำเร็จ' },
      400,
    );
  }
});