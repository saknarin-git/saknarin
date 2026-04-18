import '../_shared/edge-runtime.d.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  try {
    const { title, first_name, last_name } = await request.json();

    const { data, error } = await adminClient
      .from('members')
      .select('member_no, title, first_name, last_name')
      .eq('title', title)
      .ilike('first_name', `%${String(first_name).trim()}%`)
      .ilike('last_name', `%${String(last_name).trim()}%`)
      .eq('active', true)
      .limit(10);

    if (error) {
      throw error;
    }

    return jsonResponse({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonResponse(
      { success: false, message: error instanceof Error ? error.message : 'ค้นหาสมาชิกไม่สำเร็จ' },
      400,
    );
  }
});