import './edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

export const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

export function createUserClient(accessToken?: string) {
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export function toAuthEmail(username: string) {
  return `${username.trim().toLowerCase()}@saknarin.local`;
}

export async function ensureAdmin(accessToken?: string) {
  if (!accessToken) {
    throw new Error('Unauthorized');
  }

  const client = createUserClient(accessToken);
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser(accessToken);

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: profile, error: profileError } = await adminClient
    .from('app_users')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin' || profile.approval_status !== 'approved') {
    throw new Error('Forbidden');
  }

  return profile;
}