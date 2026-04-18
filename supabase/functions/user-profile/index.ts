import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, ensureAuthenticated } from '../_shared/supabaseAdmin.ts';

const allowedTitles = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

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

    return jsonResponse({ success: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ไม่สามารถจัดการข้อมูลส่วนตัวได้';
    const status = message === 'Unauthorized' ? 401 : 400;
    return jsonResponse({ success: false, message }, status);
  }
});