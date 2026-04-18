import '../_shared/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, ensureAuthenticated, toAuthEmail } from '../_shared/supabaseAdmin.ts';

const allowedTitles = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    const profile = await ensureAuthenticated(accessToken);

    if (request.method === 'GET') {
      return jsonResponse({ success: true, data: profile });
    }

    if (request.method === 'PATCH') {
      const { title, first_name, last_name } = await request.json();

      if (!allowedTitles.includes(String(title))) {
        return jsonResponse({ success: false, message: 'คำนำหน้าชื่อไม่ถูกต้อง' }, 400);
      }

      const firstName = String(first_name ?? '').trim();
      const lastName = String(last_name ?? '').trim();

      if (!firstName || !lastName) {
        return jsonResponse({ success: false, message: 'กรุณากรอกชื่อและสกุลให้ครบถ้วน' }, 400);
      }

      const { data: updatedProfile, error } = await adminClient
        .from('app_users')
        .update({
          title,
          first_name: firstName,
          last_name: lastName,
        })
        .eq('id', profile.id)
        .select('id, member_no, title, first_name, last_name, username, role, approval_status')
        .single();

      if (error || !updatedProfile) {
        throw error ?? new Error('ไม่สามารถอัปเดตข้อมูลผู้ใช้งานได้');
      }

      return jsonResponse({
        success: true,
        message: 'บันทึกข้อมูลส่วนตัวเรียบร้อย',
        data: updatedProfile,
      });
    }

    if (request.method === 'PUT') {
      const { current_password, new_password } = await request.json();

      const currentPassword = String(current_password ?? '');
      const newPassword = String(new_password ?? '');

      if (!currentPassword || !newPassword) {
        return jsonResponse({ success: false, message: 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่ให้ครบถ้วน' }, 400);
      }

      if (newPassword.length < 6) {
        return jsonResponse({ success: false, message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' }, 400);
      }

      const authClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
      });

      const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
        email: toAuthEmail(profile.username),
        password: currentPassword,
      });

      if (signInError || !signInData.user) {
        return jsonResponse({ success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' }, 400);
      }

      const { error } = await adminClient.auth.admin.updateUserById(profile.auth_user_id, {
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      await authClient.auth.signOut();

      return jsonResponse({ success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อย' });
    }

    return jsonResponse({ success: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ไม่สามารถจัดการข้อมูลส่วนตัวได้';
    const status = message === 'Unauthorized' ? 401 : 400;
    return jsonResponse({ success: false, message }, status);
  }
});