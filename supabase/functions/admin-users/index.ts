import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, ensureAdmin } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    const adminProfile = await ensureAdmin(accessToken);

    if (request.method === 'GET') {
      const [{ data: users, error: usersError }, { data: settings, error: settingsError }] = await Promise.all([
        adminClient
          .from('app_users')
          .select('id, member_no, title, first_name, last_name, username, role, approval_status')
          .order('created_at', { ascending: false }),
        adminClient.from('app_settings').select('group_name, notice, allow_registration').eq('id', 1).single(),
      ]);

      if (usersError || settingsError) {
        throw usersError ?? settingsError;
      }

      return jsonResponse({ success: true, data: { users: users ?? [], settings } });
    }

    if (request.method === 'PATCH') {
      const { userId, approvalStatus, role } = await request.json();

      if (!['pending', 'approved', 'rejected'].includes(approvalStatus)) {
        return jsonResponse({ success: false, message: 'สถานะไม่ถูกต้อง' }, 400);
      }

      if (!['member', 'admin'].includes(role)) {
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