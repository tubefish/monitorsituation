import type { Geometry } from 'geojson';
import { isMobileDevice } from '@/utils';
import { getCountriesGeoJson } from '@/services/country-geometry';
import {
  GLOBE_TEXTURE_URLS,
  getGlobeTexture,
  setGlobeTexture,
  subscribeGlobeTextureChange,
  type GlobeTexture,
} from '@/services/globe-render-settings';

const TOGGLE_TOP_PX = 8;
const TOGGLE_RIGHT_PX = 54;

const FAR_LABEL_CODES = new Set([
  'US', 'CA', 'MX', 'BR', 'AR',
  'RU', 'CN', 'IN', 'AU', 'ID',
  'SA', 'IR', 'TR', 'EG', 'DZ', 'SD', 'CD', 'ZA', 'NG', 'ET',
  'FR', 'DE', 'ES', 'IT', 'GB', 'UA', 'KZ', 'JP', 'PK',
]);

const LABEL_CENTER_OVERRIDES: Record<string, { lat: number; lng: number }> = {
  US: { lat: 38.5, lng: -98.5 },
  CA: { lat: 56.0, lng: -106.0 },
  RU: { lat: 61.5, lng: 92.0 },
  FR: { lat: 46.4, lng: 2.2 },
  ID: { lat: -2.5, lng: 118.0 },
  AU: { lat: -25.5, lng: 134.0 },
  BR: { lat: -10.5, lng: -52.5 },
  CN: { lat: 35.5, lng: 103.5 },
  IN: { lat: 22.8, lng: 79.0 },
  JP: { lat: 37.5, lng: 138.0 },
};

type CountryBoundaryDatum = {
  _wmCountryBoundary: true;
  code: string;
  name: string;
  geometry: Geometry;
};

type CountryLabelDatum = {
  code: string;
  text: string;
  lat: number;
  lng: number;
  rank: 0 | 1 | 2;
  size: number;
};

type GlobeMaterialRuntime = {
  color?: { set: (color: string) => void };
  emissive?: { set: (color: string) => void };
  emissiveIntensity?: number;
  needsUpdate?: boolean;
};

type GlobeControlsRuntime = {
  addEventListener?: (event: string, cb: () => void) => void;
  removeEventListener?: (event: string, cb: () => void) => void;
};

type GlobeRuntime = {
  globeImageUrl: (url: string) => unknown;
  globeMaterial?: () => GlobeMaterialRuntime;
  atmosphereColor?: (color: string) => unknown;
  atmosphereAltitude?: (altitude: number) => unknown;
  pointOfView?: () => { lat: number; lng: number; altitude: number };
  controls?: () => GlobeControlsRuntime;
  polygonsData?: (data?: unknown[]) => unknown;
  polygonGeoJsonGeometry?: (accessor?: unknown) => unknown;
  polygonCapColor?: (accessor?: unknown) => unknown;
  polygonSideColor?: (accessor?: unknown) => unknown;
  polygonStrokeColor?: (accessor?: unknown) => unknown;
  polygonAltitude?: (accessor?: unknown) => unknown;
  labelsData?: (data: unknown[]) => unknown;
  labelLat?: (accessor: unknown) => unknown;
  labelLng?: (accessor: unknown) => unknown;
  labelText?: (accessor: unknown) => unknown;
  labelColor?: (accessor: unknown) => unknown;
  labelAltitude?: (accessor: unknown) => unknown;
  labelSize?: (accessor: unknown) => unknown;
  labelIncludeDot?: (include: boolean) => unknown;
  labelResolution?: (resolution: number) => unknown;
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

function ringBounds(ring: unknown): {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  area: number;
} | null {
  if (!Array.isArray(ring)) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let count = 0;

  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    count += 1;
  }

  if (count < 3) return null;

  return {
    minLng,
    minLat,
    maxLng,
    maxLat,
    area: Math.max(0, maxLng - minLng) * Math.max(0, maxLat - minLat),
  };
}

function geometryLabelCenter(geometry: Geometry): { lat: number; lng: number; area: number } | null {
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];

  let best: ReturnType<typeof ringBounds> = null;
  for (const polygon of polygons) {
    const candidate = ringBounds(polygon[0]);
    if (candidate && (!best || candidate.area > best.area)) best = candidate;
  }
  if (!best) return null;

  return {
    lat: (best.minLat + best.maxLat) / 2,
    lng: (best.minLng + best.maxLng) / 2,
    area: best.area,
  };
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

/**
 * $MONITOR globe presentation layer.
 *
 * This stays deliberately separate from GlobeMapCore's operational overlays:
 * it only owns the base Earth skin, country outlines/labels, and the
 * Satellite/Tactical selector. Existing markers, conflict polygons, paths,
 * hit-testing, camera state, and site light/dark mode remain independent.
 */
export class GlobePresentation {
  private toggle: HTMLElement | null = null;
  private unsubscribeTexture: (() => void) | null = null;
  private controlsLabelHandler: (() => void) | null = null;
  private restorePolygonDataMethod: (() => void) | null = null;
  private countryBoundaries: CountryBoundaryDatum[] = [];
  private countryLabels: CountryLabelDatum[] = [];

  public constructor(
    private readonly container: HTMLElement,
    private readonly globe: GlobeRuntime,
    private readonly wakeGlobe: () => void,
  ) {}

  public async init(): Promise<void> {
    this.installToggle();
    await this.installCountryPresentation();
    this.applySkin(getGlobeTexture());

    this.unsubscribeTexture = subscribeGlobeTextureChange((texture) => {
      this.applySkin(texture);
      this.updateToggle(texture);
    });
  }

  private installToggle(): void {
    if (this.toggle || typeof document === 'undefined') return;

    const toggle = document.createElement('div');
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'Globe appearance');
    Object.assign(toggle.style, {
      position: 'absolute',
      top: `${TOGGLE_TOP_PX}px`,
      right: `${TOGGLE_RIGHT_PX}px`,
      zIndex: '12',
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px',
      gap: '2px',
      border: '1px solid rgba(120, 130, 145, 0.34)',
      borderRadius: '6px',
      background: 'rgba(250, 251, 252, 0.92)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.10)',
      backdropFilter: 'blur(6px)',
      fontFamily: 'inherit',
      userSelect: 'none',
    });

    const makeButton = (label: string, texture: GlobeTexture): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.globeTexture = texture;
      button.textContent = label;
      button.title = `${label} globe`;
      button.addEventListener('click', () => setGlobeTexture(texture));
      Object.assign(button.style, {
        appearance: 'none',
        border: '0',
        borderRadius: '4px',
        padding: isMobileDevice() ? '4px 7px' : '5px 10px',
        background: 'transparent',
        color: '#4b5563',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: isMobileDevice() ? '10px' : '11px',
        fontWeight: '600',
        letterSpacing: '0.02em',
        lineHeight: '1.1',
      });
      return button;
    };

    toggle.append(
      makeButton('Satellite', 'blue-marble'),
      makeButton('Tactical', 'topographic'),
    );

    this.container.appendChild(toggle);
    this.toggle = toggle;
    this.updateToggle(getGlobeTexture());
  }

  private updateToggle(texture: GlobeTexture): void {
    if (!this.toggle) return;
    const buttons = this.toggle.querySelectorAll<HTMLButtonElement>('button[data-globe-texture]');
    buttons.forEach((button) => {
      const active = button.dataset.globeTexture === texture;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.style.background = active ? '#1f2937' : 'transparent';
      button.style.color = active ? '#ffffff' : '#4b5563';
      button.style.boxShadow = active ? '0 1px 2px rgba(0, 0, 0, 0.16)' : 'none';
    });
  }

  private async installCountryPresentation(): Promise<void> {
    const countries = await getCountriesGeoJson();
    if (!countries) return;

    const boundaries: CountryBoundaryDatum[] = [];
    const labels: CountryLabelDatum[] = [];

    for (const feature of countries.features) {
      if (!feature.geometry) continue;
      const properties = (feature.properties ?? null) as Record<string, unknown> | null;
      const code = readFeatureCode(properties);
      const name = readFeatureName(properties);
      if (!code || !name) continue;

      boundaries.push({
        _wmCountryBoundary: true,
        code,
        name,
        geometry: feature.geometry,
      });

      const center = geometryLabelCenter(feature.geometry);
      if (!center) continue;
      const override = LABEL_CENTER_OVERRIDES[code];
      const rank: 0 | 1 | 2 = FAR_LABEL_CODES.has(code)
        ? 0
        : center.area >= 120
          ? 1
          : 2;

      labels.push({
        code,
        text: name.toUpperCase(),
        lat: override?.lat ?? center.lat,
        lng: override?.lng ?? center.lng,
        rank,
        size: rank === 0 ? 0.62 : rank === 1 ? 0.50 : 0.40,
      });
    }

    this.countryBoundaries = boundaries;
    this.countryLabels = labels;

    this.installCountryBorders();
    this.installCountryLabels();
    this.wakeGlobe();
  }

  private installCountryBorders(): void {
    const globe = this.globe;
    if (
      typeof globe.polygonsData !== 'function'
      || typeof globe.polygonGeoJsonGeometry !== 'function'
      || typeof globe.polygonCapColor !== 'function'
      || typeof globe.polygonSideColor !== 'function'
      || typeof globe.polygonStrokeColor !== 'function'
      || typeof globe.polygonAltitude !== 'function'
    ) {
      return;
    }

    const originalPolygonsDataMethod = globe.polygonsData;
    const originalPolygonsData = originalPolygonsDataMethod.bind(globe);
    const originalGeometry = globe.polygonGeoJsonGeometry();
    const originalCapColor = globe.polygonCapColor();
    const originalSideColor = globe.polygonSideColor();
    const originalStrokeColor = globe.polygonStrokeColor();
    const originalAltitude = globe.polygonAltitude();

    const isCountryBoundary = (datum: unknown): datum is CountryBoundaryDatum => (
      Boolean(datum && typeof datum === 'object' && '_wmCountryBoundary' in datum)
    );

    const withBorders = (data: unknown[]): unknown[] => [
      ...data.filter((item) => !isCountryBoundary(item)),
      ...this.countryBoundaries,
    ];

    globe.polygonGeoJsonGeometry((datum: unknown) => (
      isCountryBoundary(datum) ? datum.geometry : resolveAccessor(originalGeometry, datum)
    ));
    globe.polygonCapColor((datum: unknown) => (
      isCountryBoundary(datum) ? 'rgba(0,0,0,0)' : resolveAccessor(originalCapColor, datum)
    ));
    globe.polygonSideColor((datum: unknown) => (
      isCountryBoundary(datum) ? 'rgba(0,0,0,0)' : resolveAccessor(originalSideColor, datum)
    ));
    globe.polygonStrokeColor((datum: unknown) => (
      isCountryBoundary(datum) ? this.countryBorderColor() : resolveAccessor(originalStrokeColor, datum)
    ));
    globe.polygonAltitude((datum: unknown) => (
      isCountryBoundary(datum) ? 0.0025 : resolveAccessor(originalAltitude, datum)
    ));

    globe.polygonsData = ((data?: unknown[]) => {
      if (data === undefined) return originalPolygonsData();
      return originalPolygonsData(withBorders(Array.isArray(data) ? data : []));
    }) as typeof globe.polygonsData;

    const current = originalPolygonsData();
    originalPolygonsData(withBorders(Array.isArray(current) ? current : []));

    this.restorePolygonDataMethod = () => {
      globe.polygonsData = originalPolygonsDataMethod;
    };
  }

  private installCountryLabels(): void {
    const globe = this.globe;
    if (
      typeof globe.labelsData !== 'function'
      || typeof globe.labelLat !== 'function'
      || typeof globe.labelLng !== 'function'
      || typeof globe.labelText !== 'function'
      || typeof globe.labelColor !== 'function'
      || typeof globe.labelAltitude !== 'function'
      || typeof globe.labelSize !== 'function'
    ) {
      return;
    }

    globe.labelLat('lat');
    globe.labelLng('lng');
    globe.labelText('text');
    globe.labelColor(() => this.countryLabelColor());
    globe.labelAltitude(0.006);
    globe.labelSize('size');
    globe.labelIncludeDot?.(false);
    globe.labelResolution?.(2);
    this.updateCountryLabels();

    const controls = globe.controls?.();
    if (controls?.addEventListener) {
      this.controlsLabelHandler = () => this.updateCountryLabels();
      controls.addEventListener('end', this.controlsLabelHandler);
    }
  }

  private countryBorderColor(): string {
    return getGlobeTexture() === 'topographic'
      ? 'rgba(120, 214, 255, 0.92)'
      : 'rgba(255, 255, 255, 0.76)';
  }

  private countryLabelColor(): string {
    return getGlobeTexture() === 'topographic' ? '#d9f4ff' : '#ffffff';
  }

  private updateCountryLabels(): void {
    if (typeof this.globe.labelsData !== 'function') return;
    const altitude = this.globe.pointOfView?.().altitude ?? 1.8;
    const maxRank = altitude <= 0.72 ? 2 : altitude <= 1.25 ? 1 : 0;
    this.globe.labelsData(this.countryLabels.filter((label) => label.rank <= maxRank));
  }

  private applySkin(texture: GlobeTexture): void {
    this.wakeGlobe();
    this.globe.globeImageUrl(GLOBE_TEXTURE_URLS[texture]);

    const material = this.globe.globeMaterial?.();
    if (material?.color?.set) {
      material.color.set(texture === 'topographic' ? '#60788f' : '#ffffff');
    }
    if (material?.emissive?.set) {
      material.emissive.set(texture === 'topographic' ? '#03111d' : '#000000');
    }
    if (typeof material?.emissiveIntensity === 'number') {
      material.emissiveIntensity = texture === 'topographic' ? 0.18 : 0;
    }
    if (material) material.needsUpdate = true;

    this.globe.atmosphereColor?.(texture === 'topographic' ? '#55b9ec' : '#69bfff');
    this.globe.atmosphereAltitude?.(texture === 'topographic' ? 0.13 : 0.15);

    // Border and label accessors read the selected texture dynamically.
    // Refreshing label data triggers a clean repaint without touching any
    // operational marker or polygon state.
    this.globe.labelColor?.(() => this.countryLabelColor());
    this.updateCountryLabels();
  }

  public destroy(): void {
    if (this.controlsLabelHandler) {
      this.globe.controls?.()?.removeEventListener?.('end', this.controlsLabelHandler);
      this.controlsLabelHandler = null;
    }
    this.restorePolygonDataMethod?.();
    this.restorePolygonDataMethod = null;
    this.unsubscribeTexture?.();
    this.unsubscribeTexture = null;
    this.toggle?.remove();
    this.toggle = null;
  }
}
