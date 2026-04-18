import { apiRequest } from './client';
import type { SystemOverviewResponse } from '../types';

export async function fetchSystemOverview(token: string) {
  return apiRequest<SystemOverviewResponse>('system-overview', { method: 'GET' }, token);
}