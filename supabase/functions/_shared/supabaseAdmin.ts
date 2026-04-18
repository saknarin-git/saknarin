import './edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

export type AppRole = 'member' | 'officer' | 'admin' | 'dev_admin';
export type PermissionKey =
  | 'view_system_dashboard'
  | 'view_user_workspace'
  | 'view_officer_workspace'
  | 'manage_members'
  | 'manage_loans'
  | 'access_devmanager';

export type PermissionSet = Record<PermissionKey, boolean>;
export type RolePermissionsMatrix = Record<AppRole, PermissionSet>;

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const fullPermissionSet: PermissionSet = {
  view_system_dashboard: true,
  view_user_workspace: true,
  view_officer_workspace: true,
  manage_members: true,
  manage_loans: true,
  access_devmanager: true,
};

const defaultRolePermissions: RolePermissionsMatrix = {
  dev_admin: fullPermissionSet,
  admin: {
    view_system_dashboard: true,
    view_user_workspace: true,
    view_officer_workspace: true,
    manage_members: true,
    manage_loans: true,
    access_devmanager: true,
  },
  officer: {
    view_system_dashboard: true,
    view_user_workspace: true,
    view_officer_workspace: true,
    manage_members: true,
    manage_loans: true,
    access_devmanager: false,
  },
  member: {
    view_system_dashboard: true,
    view_user_workspace: true,
    view_officer_workspace: false,
    manage_members: false,
    manage_loans: false,
    access_devmanager: false,
  },
};

export const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function normalizePermissionSet(raw: unknown, fallback: PermissionSet): PermissionSet {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    view_system_dashboard: source.view_system_dashboard === undefined ? fallback.view_system_dashboard : Boolean(source.view_system_dashboard),
    view_user_workspace: source.view_user_workspace === undefined ? fallback.view_user_workspace : Boolean(source.view_user_workspace),
    view_officer_workspace: source.view_officer_workspace === undefined ? fallback.view_officer_workspace : Boolean(source.view_officer_workspace),
    manage_members: source.manage_members === undefined ? fallback.manage_members : Boolean(source.manage_members),
    manage_loans: source.manage_loans === undefined ? fallback.manage_loans : Boolean(source.manage_loans),
    access_devmanager: source.access_devmanager === undefined ? fallback.access_devmanager : Boolean(source.access_devmanager),
  };
}

export function normalizeRolePermissions(raw: unknown): RolePermissionsMatrix {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    dev_admin: fullPermissionSet,
    admin: normalizePermissionSet(source.admin, defaultRolePermissions.admin),
    officer: normalizePermissionSet(source.officer, defaultRolePermissions.officer),
    member: normalizePermissionSet(source.member, defaultRolePermissions.member),
  };
}

export function getDefaultRolePermissions() {
  return defaultRolePermissions;
}

export async function getRolePermissionsMatrix() {
  const { data, error } = await adminClient
    .from('app_settings')
    .select('role_permissions')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return defaultRolePermissions;
  }

  return normalizeRolePermissions(data.role_permissions);
}

export async function getPermissionsForRole(role: AppRole) {
  if (role === 'dev_admin') {
    return fullPermissionSet;
  }

  const matrix = await getRolePermissionsMatrix();
  return matrix[role];
}

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

export async function ensureUser(accessToken?: string) {
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

  if (profileError || !profile) {
    throw new Error('Forbidden');
  }

  return profile;
}

export async function ensureAuthenticated(accessToken?: string) {
  const profile = await ensureUser(accessToken);

  if (!profile || profile.approval_status !== 'approved') {
    throw new Error('Forbidden');
  }

  return profile;
}

export async function ensureStaff(accessToken?: string) {
  const profile = await ensureAuthenticated(accessToken);

  if (!['admin', 'officer'].includes(profile.role)) {
    throw new Error('Forbidden');
  }

  return profile;
}

export async function ensureAdmin(accessToken?: string) {
  const profile = await ensureAuthenticated(accessToken);

  if (!['admin', 'dev_admin'].includes(profile.role) || profile.approval_status !== 'approved') {
    throw new Error('Forbidden');
  }

  return profile;
}

export async function ensureDevAdmin(accessToken?: string) {
  const profile = await ensureAuthenticated(accessToken);

  if (profile.role !== 'dev_admin') {
    throw new Error('Forbidden');
  }

  return profile;
}

export async function ensurePermission(accessToken: string | undefined, permission: PermissionKey) {
  const profile = await ensureAuthenticated(accessToken);

  if (profile.role === 'dev_admin') {
    return profile;
  }

  const permissions = await getPermissionsForRole(profile.role as AppRole);
  if (!permissions[permission]) {
    throw new Error('Forbidden');
  }

  return profile;
}