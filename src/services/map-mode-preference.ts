import { DEFAULT_MAP_MODE, type MapModePreference } from '@/config/variants/base';

export function normalizeMapModePreference(value: string | null | undefined): MapModePreference {
  if (value === 'flat' || value === 'globe') return value;
  return DEFAULT_MAP_MODE;
}

export function getStoredMapModePreference(): MapModePreference {
  return 'globe';
}
