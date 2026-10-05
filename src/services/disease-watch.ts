import { ensureHydrated } from '@/services/bootstrap';
import type { DiseaseWatchData, DiseaseWatchFeed } from '@/types/disease-watch';

const emptyFeed = (): DiseaseWatchFeed => ({ status: 'unavailable', fetchedAt: 0, reports: [] });
let cached: { data: DiseaseWatchData; at: number } | null = null;
export async function fetchDiseaseWatch(force = false): Promise<DiseaseWatchData> {
  if (!force && cached && Date.now() - cached.at < 300_000) return cached.data;
  const data = await ensureHydrated('diseaseWatch') as DiseaseWatchData | undefined;
  if (!data || !Array.isArray(data.russia?.reports) || !Array.isArray(data.global?.reports)) {
    throw new Error('Disease watch is temporarily unavailable');
  }
  cached = { data, at: Date.now() };
  return data;
}
export const emptyDiseaseWatch = (): DiseaseWatchData => ({ russia: emptyFeed(), global: emptyFeed() });

export function diseaseGroup(title: string): string {
  const groups: [RegExp, string][] = [
    [/ebola|bundibugyo/i, 'Ebola'], [/hantavirus/i, 'Hantavirus'],
    [/mpox|monkeypox/i, 'Mpox'], [/cholera/i, 'Cholera'],
    [/influenza|avian flu/i, 'Influenza'], [/nipah/i, 'Nipah'],
    [/yellow fever/i, 'Yellow fever'], [/measles/i, 'Measles'],
    [/dengue/i, 'Dengue'], [/plague/i, 'Plague'], [/polio/i, 'Polio'],
    [/marburg/i, 'Marburg'], [/mers/i, 'MERS'],
  ];
  return groups.find(([pattern]) => pattern.test(title))?.[1] ?? 'Other events';
}
