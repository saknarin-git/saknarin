import '../_shared/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, getPermissionsForRole, toAuthEmail } from '../_shared/supabaseAdmin.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const { username, password } = await request.json();
    const email = toAuthEmail(String(username));

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    const {
      data: { session, user },
      error: signInError,
    } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !session || !user) {
      return jsonResponse({ success: false, message: 'Username หรือ Password ไม่ถูกต้อง' }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('app_users')
      .select('id, member_no, title, first_name, last_name, username, role, approval_status')
      .eq('auth_user_id', user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ success: false, message: 'ไม่พบบัญชีผู้ใช้งานในระบบ' }, 404);
    }

    if (profile.approval_status !== 'approved') {
      await authClient.auth.signOut();
      return jsonResponse(
        { success: false, message: 'บัญชีนี้ยังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ' },
        403,
      );
    }

    const permissions = await getPermissionsForRole(profile.role);

    return jsonResponse({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      data: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: profile,
        permissions,
      },
    });
  } catch (error) {
    return jsonResponse(
      { success: false, message: error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ' },
      400,
    );
  }
});