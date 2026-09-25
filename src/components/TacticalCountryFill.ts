import type { Geometry } from 'geojson';
import { getCountriesGeoJson } from '@/services/country-geometry';
import {
  GLOBE_TEXTURE_URLS,
  getGlobeTexture,
  subscribeGlobeTextureChange,
  type GlobeTexture,
} from '@/services/globe-render-settings';

type TacticalCountryDatum = {
  _wmTacticalCountry: true;
  code: string;
  name: string;
  geometry: Geometry;
};

type GlobeMaterialRuntime = {
  color?: { set: (color: string) => void };
  emissive?: { set: (color: string) => void };
  emissiveIntensity?: number;
  needsUpdate?: boolean;
};

type GlobeRuntime = {
  globeImageUrl?: (url: string) => unknown;
  globeMaterial?: () => GlobeMaterialRuntime;
  polygonsData?: (data?: unknown[]) => unknown;
  polygonGeoJsonGeometry?: (accessor?: unknown) => unknown;
  polygonCapColor?: (accessor?: unknown) => unknown;
  polygonSideColor?: (accessor?: unknown) => unknown;
  polygonStrokeColor?: (accessor?: unknown) => unknown;
  polygonAltitude?: (accessor?: unknown) => unknown;
  polygonLabel?: (accessor?: unknown) => unknown;
  polygonCapCurvatureResolution?: (accessor?: unknown) => unknown;
};

function readFeatureCode(properties: Record<string, unknown> | null | undefined): string | null {
  if (!properties) return null;
  const raw = properties['ISO3166-1-Alpha-2'] ?? properties.ISO_A2 ?? properties.iso_a2;
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function readFeatureName(properties: Record<string, unknown> | null | undefined): string | null {
  if (!properties) return null;
  const raw = properties.name ?? properties.NAME ?? properties.admin;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function resolveAccessor(accessor: unknown, datum: unknown): unknown {
  if (typeof accessor === 'function') {
    return (accessor as (value: unknown) => unknown)(datum);
  }
  if (typeof accessor === 'string' && datum && typeof datum === 'object') {
    return (datum as Record<string, unknown>)[accessor];
  }
  return accessor;
}

function tacticalCountryColor(code: string): string {
  const shades = ['#263a4b', '#2b4052', '#304658'];
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = ((hash << 5) - hash) + code.charCodeAt(i);
  return shades[Math.abs(hash) % shades.length];
}

/**
 * Replaces the dark-satellite look of Tactical mode with a flat intelligence-map
 * treatment: solid navy ocean plus subtly varied slate country fills. Existing
 * conflict polygons and all other operational overlays remain above this layer.
 */
export class TacticalCountryFill {
  private countries: TacticalCountryDatum[] = [];
  private unsubscribeTexture: (() => void) | null = null;
  private restorePolygonHooks: (() => void) | null = null;

  public constructor(
    private readonly globe: GlobeRuntime,
    private readonly wakeGlobe: () => void,
  ) {}

  public async init(): Promise<void> {
    const countries = await getCountriesGeoJson();
    if (!countries) return;

    this.countries = countries.features.flatMap((feature) => {
      if (!feature.geometry) return [];
      const properties = (feature.properties ?? null) as Record<string, unknown> | null;
      const code = readFeatureCode(properties);
      const name = readFeatureName(properties);
      if (!code || !name) return [];
      return [{
        _wmTacticalCountry: true as const,
        code,
        name,
        geometry: feature.geometry,
      }];
    });

    this.installPolygonOverlay();
    this.applyMode(getGlobeTexture());
    this.unsubscribeTexture = subscribeGlobeTextureChange((texture) => this.applyMode(texture));
  }

  private safeWake(): void {
    try {
      this.wakeGlobe();
    } catch {
      // Never let a presentation-only refresh block the rest of the globe.
    }
  }

  private installPolygonOverlay(): void {
    const globe = this.globe;
    if (
      typeof globe.polygonsData !== 'function'
      || typeof globe.polygonGeoJsonGeometry !== 'function'
      || typeof globe.polygonCapColor !== 'function'
      || typeof globe.polygonSideColor !== 'function'
      || typeof globe.polygonStrokeColor !== 'function'
      || typeof globe.polygonAltitude !== 'function'
    ) return;

    const originalDataMethod = globe.polygonsData;
    const originalData = originalDataMethod.bind(globe);
    const originalGeometry = globe.polygonGeoJsonGeometry();
    const originalCapColor = globe.polygonCapColor();
    const originalSideColor = globe.polygonSideColor();
    const originalStrokeColor = globe.polygonStrokeColor();
    const originalAltitude = globe.polygonAltitude();
    const originalLabel = globe.polygonLabel?.();
    const originalCurvature = globe.polygonCapCurvatureResolution?.();

    const isTacticalCountry = (datum: unknown): datum is TacticalCountryDatum => (
      Boolean(datum && typeof datum === 'object' && '_wmTacticalCountry' in datum)
    );

    const withCountries = (data: unknown[]): unknown[] => {
      const clean = data.filter((item) => !isTacticalCountry(item));
      return getGlobeTexture() === 'topographic' ? [...clean, ...this.countries] : clean;
    };

    globe.polygonGeoJsonGeometry((datum: unknown) => (
      isTacticalCountry(datum) ? datum.geometry : resolveAccessor(originalGeometry, datum)
    ));
    globe.polygonCapColor((datum: unknown) => (
      isTacticalCountry(datum) ? tacticalCountryColor(datum.code) : resolveAccessor(originalCapColor, datum)
    ));
    globe.polygonSideColor((datum: unknown) => (
      isTacticalCountry(datum) ? tacticalCountryColor(datum.code) : resolveAccessor(originalSideColor, datum)
    ));
    globe.polygonStrokeColor((datum: unknown) => (
      isTacticalCountry(datum) ? 'transparent' : resolveAccessor(originalStrokeColor, datum)
    ));
    globe.polygonAltitude((datum: unknown) => (
      isTacticalCountry(datum) ? 0.0015 : resolveAccessor(originalAltitude, datum)
    ));
    if (typeof globe.polygonLabel === 'function') {
      globe.polygonLabel((datum: unknown) => (
        isTacticalCountry(datum) ? '' : resolveAccessor(originalLabel, datum)
      ));
    }
    if (typeof globe.polygonCapCurvatureResolution === 'function') {
      globe.polygonCapCurvatureResolution((datum: unknown) => (
        isTacticalCountry(datum) ? 0.55 : resolveAccessor(originalCurvature, datum)
      ));
    }

    globe.polygonsData = ((data?: unknown[]) => {
      if (data === undefined) return originalData();
      return originalData(withCountries(Array.isArray(data) ? data : []));
    }) as typeof globe.polygonsData;

    const current = originalData();
    originalData(withCountries(Array.isArray(current) ? current : []));

    this.restorePolygonHooks = () => {
      globe.polygonsData = originalDataMethod;
      globe.polygonGeoJsonGeometry?.(originalGeometry);
      globe.polygonCapColor?.(originalCapColor);
      globe.polygonSideColor?.(originalSideColor);
      globe.polygonStrokeColor?.(originalStrokeColor);
      globe.polygonAltitude?.(originalAltitude);
      if (typeof globe.polygonLabel === 'function') globe.polygonLabel(originalLabel);
      if (typeof globe.polygonCapCurvatureResolution === 'function') {
        globe.polygonCapCurvatureResolution(originalCurvature);
      }
    };
  }

  private applyMode(texture: GlobeTexture): void {
    const tactical = texture === 'topographic';

    // A falsy globe image produces a plain sphere. That lets the polygon layer
    // define the land instead of showing the topographic/satellite photograph.
    this.globe.globeImageUrl?.(tactical ? '' : GLOBE_TEXTURE_URLS['blue-marble']);

    const material = this.globe.globeMaterial?.();
    if (material?.color?.set) material.color.set(tactical ? '#081826' : '#ffffff');
    if (material?.emissive?.set) material.emissive.set(tactical ? '#061521' : '#000000');
    if (typeof material?.emissiveIntensity === 'number') {
      material.emissiveIntensity = tactical ? 0.32 : 0;
    }
    if (material) material.needsUpdate = true;

    if (typeof this.globe.polygonsData === 'function') {
      const current = this.globe.polygonsData();
      this.globe.polygonsData(Array.isArray(current) ? current : []);
    }
    this.safeWake();
  }

  public destroy(): void {
    this.unsubscribeTexture?.();
    this.unsubscribeTexture = null;
    this.restorePolygonHooks?.();
    this.restorePolygonHooks = null;
  }
}
