import { toApiUrl } from '@/services/runtime';
import type { EscalationXAccount, EscalationXPost } from './escalation-x-feed';

export interface MonitoringPost extends EscalationXPost { account: EscalationXAccount }
export interface MonitoringFeed { posts: MonitoringPost[]; nextToken: string | null; fetchedAt: string }

export async function fetchMonitoringFeed(signal: AbortSignal, cursor?: string): Promise<MonitoringFeed> {
  const params = new URLSearchParams({ mode: 'monitoring' });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(toApiUrl(`/api/escalation-x-feed?${params}`), { signal, headers: { Accept: 'application/json' } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'X search is temporarily unavailable');
  return body as MonitoringFeed;
}
