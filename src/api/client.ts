const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://zpknotoujmvkeqeoqgyf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const functionsBaseUrl = `${supabaseUrl}/functions/v1`;

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});

  if (supabaseAnonKey && !headers.has('apikey')) {
    headers.set('apikey', supabaseAnonKey);
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${functionsBaseUrl}/${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({ message: 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์' }));

  if (!response.ok) {
    throw new Error(payload.message ?? 'Request failed');
  }

  return payload as T;
}