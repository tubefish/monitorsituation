export interface DiseaseWatchReport {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
}

export interface DiseaseWatchFeed {
  status: 'ok' | 'stale' | 'unavailable';
  fetchedAt: number;
  reports: DiseaseWatchReport[];
}

export interface DiseaseWatchData {
  russia: DiseaseWatchFeed;
  global: DiseaseWatchFeed;
}
