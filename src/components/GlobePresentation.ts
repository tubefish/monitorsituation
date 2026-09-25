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
const BORDER_ALTITUDE = 0.009;
const LABEL_ALTITUDE = 0.018;

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

type CountryBorderPath = {
  _wmCountryBorder: true;
  id: string;
  name: string;
  points: number[][];
};

type CountryLabelDatum = {
  _wmCountryLabel: true;
  code: string;
  text: string;
  _lat: number;
  _lng: number;
  rank: 0 | 1 | 2;
  fontPx: number;
};

type GlobeMaterialRuntime = {
  color?: { set: (color: string) => void };
  emissive?: { set: (color: string) => void };
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  needsUpdate?: boolean;
};

type GlobeControlsRuntime = {
  addEventListener?: (event: string, cb: () => void) => void;
  removeEventListener?: (event: string, cb: () => void) => void;
};

type GlobeRuntime = {
  globeMaterial?: () => GlobeMaterialRuntime;
  atmosphereColor?: (color: string) => unknown;
  atmosphereAltitude?: (altitude: number) => unknown;
  pointOfView?: () => { lat: number; lng: number; altitude: number };
  controls?: () => GlobeControlsRuntime;

  pathsData?: (data?: unknown[]) => unknown;
  pathPoints?: (accessor?: unknown) => unknown;
  pathPointLat?: (accessor?: unknown) => unknown;
  pathPointLng?: (accessor?: unknown) => unknown;
  pathPointAlt?: (accessor?: unknown) => unknown;
  pathColor?: (accessor?: unknown) => unknown;
  pathStroke?: (accessor?: unknown) => unknown;
  pathDashLength?: (accessor?: unknown) => unknown;
  pathDashGap?: (accessor?: unknown) => unknown;
  pathDashAnimateTime?: (accessor?: unknown) => unknown;
  pathLabel?: (accessor?: unknown) => unknown;

  htmlElementsData?: (data?: unknown[]) => unknown;
  htmlLat?: (accessor?: unknown) => unknown;
  htmlLng?: (accessor?: unknown) => unknown;
  htmlAltitude?: (accessor?: unknown) => unknown;
  htmlElement?: (accessor?: unknown) => unknown;
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

function geometryBorderRings(geometry: Geometry): number[][][] {
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];

  const rings: number[][][] = [];
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!Array.isArray(outer) || outer.length < 3) continue;
    const points = outer
      .map((point) => {
        if (!Array.isArray(point) || point.length < 2) return null;
        const lng = Number(point[0]);
        const lat = Number(point[1]);
        return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
      })
      .filter((point): point is number[] => point !== null);
    if (points.length >= 3) rings.push(points);
  }
  return rings;
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

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * $MONITOR globe presentation layer.
 *
 * Owns only the Earth presentation: Satellite/Tactical skin selection,
 * readable country labels, and country borders. Operational markers, paths,
 * conflicts, camera state and site light/dark mode remain independent.
 */
export class GlobePresentation {
  private toggle: HTMLElement | null = null;
  private unsubscribeTexture: (() => void) | null = null;
  private controlsLabelHandler: (() => void) | null = null;
  private restorePathsDataMethod: (() => void) | null = null;
  private restoreHtmlDataMethod: (() => void) | null = null;
  private countryBorders: CountryBorderPath[] = [];
  private countryLabels: Omit<CountryLabelDatum, 'fontPx'>[] = [];
  private visibleLabels: CountryLabelDatum[] = [];
  private transitionGeneration = 0;
  private transitionFrame: number | null = null;

  public constructor(
    private readonly container: HTMLElement,
    private readonly globe: GlobeRuntime,
    private readonly wakeGlobe: () => void,
  ) {}

  public async init(): Promise<void> {
    this.preloadTextures();
    this.installToggle();
    await this.installCountryPresentation();
    this.applySkin(getGlobeTexture());

    this.unsubscribeTexture = subscribeGlobeTextureChange((texture) => {
      this.applySkin(texture);
      this.updateToggle(texture);
      this.refreshCountryBorders();
      this.updateCountryLabels();
    });
  }

  private preloadTextures(): void {
    if (typeof Image === 'undefined') return;
    Object.values(GLOBE_TEXTURE_URLS).forEach((url) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
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
      zIndex: '60',
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
      button.addEventListener('click', () => {
        void this.transitionToTexture(texture);
      });
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
        transition: 'background 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
      });
      button.addEventListener('pointerdown', () => {
        button.style.transform = 'scale(0.97)';
      });
      const release = () => {
        button.style.transform = 'scale(1)';
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
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

  private async transitionToTexture(texture: GlobeTexture): Promise<void> {
    if (texture === getGlobeTexture()) return;

    const material = this.globe.globeMaterial?.();
    if (!material || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setGlobeTexture(texture);
      return;
    }

    const generation = ++this.transitionGeneration;
    if (this.transitionFrame !== null) {
      cancelAnimationFrame(this.transitionFrame);
      this.transitionFrame = null;
    }

    const startOpacity = typeof material.opacity === 'number' ? material.opacity : 1;
    material.transparent = true;
    material.opacity = startOpacity;
    material.needsUpdate = true;
    this.wakeGlobe();

    await this.animateMaterialOpacity(material, startOpacity, 0.38, 150, generation);
    if (generation !== this.transitionGeneration) return;

    // The core globe subscription owns the texture swap. We trigger it only
    // after the Earth has dimmed so the change reads as a smooth transition
    // instead of a hard visual cut.
    setGlobeTexture(texture);

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 45);
    });
    if (generation !== this.transitionGeneration) return;

    await this.animateMaterialOpacity(material, 0.38, 1, 220, generation);
    if (generation !== this.transitionGeneration) return;

    material.opacity = 1;
    material.transparent = false;
    material.needsUpdate = true;
    this.transitionFrame = null;
    this.wakeGlobe();
  }

  private animateMaterialOpacity(
    material: GlobeMaterialRuntime,
    from: number,
    to: number,
    durationMs: number,
    generation: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = (now: number) => {
        if (generation !== this.transitionGeneration) {
          resolve();
          return;
        }
        const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        material.opacity = from + (to - from) * eased;
        material.needsUpdate = true;
        this.wakeGlobe();

        if (progress >= 1) {
          this.transitionFrame = null;
          resolve();
          return;
        }
        this.transitionFrame = requestAnimationFrame(tick);
      };
      this.transitionFrame = requestAnimationFrame(tick);
    });
  }

  private async installCountryPresentation(): Promise<void> {
    const countries = await getCountriesGeoJson();
    if (!countries) return;

    const borders: CountryBorderPath[] = [];
    const labels: Omit<CountryLabelDatum, 'fontPx'>[] = [];

    for (const feature of countries.features) {
      if (!feature.geometry) continue;
      const properties = (feature.properties ?? null) as Record<string, unknown> | null;
      const code = readFeatureCode(properties);
      const name = readFeatureName(properties);
      if (!code || !name) continue;

      geometryBorderRings(feature.geometry).forEach((points, index) => {
        borders.push({
          _wmCountryBorder: true,
          id: `wm-country-${code}-${index}`,
          name,
          points,
        });
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
        _wmCountryLabel: true,
        code,
        text: name.toUpperCase(),
        _lat: override?.lat ?? center.lat,
        _lng: override?.lng ?? center.lng,
        rank,
      });
    }

    this.countryBorders = borders;
    this.countryLabels = labels;

    this.installCountryBorders();
    this.installCountryLabels();
    this.wakeGlobe();
  }

  private installCountryBorders(): void {
    const globe = this.globe;
    if (
      typeof globe.pathsData !== 'function'
      || typeof globe.pathPoints !== 'function'
      || typeof globe.pathPointAlt !== 'function'
      || typeof globe.pathColor !== 'function'
      || typeof globe.pathStroke !== 'function'
      || typeof globe.pathDashLength !== 'function'
      || typeof globe.pathDashGap !== 'function'
      || typeof globe.pathDashAnimateTime !== 'function'
    ) {
      return;
    }

    const originalPathsDataMethod = globe.pathsData;
    const originalPathsData = originalPathsDataMethod.bind(globe);
    const originalPoints = globe.pathPoints();
    const originalPointAlt = globe.pathPointAlt();
    const originalColor = globe.pathColor();
    const originalStroke = globe.pathStroke();
    const originalDashLength = globe.pathDashLength();
    const originalDashGap = globe.pathDashGap();
    const originalDashAnimateTime = globe.pathDashAnimateTime();
    const originalLabel = globe.pathLabel?.();

    const isCountryBorder = (datum: unknown): datum is CountryBorderPath => (
      Boolean(datum && typeof datum === 'object' && '_wmCountryBorder' in datum)
    );

    const withBorders = (data: unknown[]): unknown[] => [
      ...data.filter((item) => !isCountryBorder(item)),
      ...this.countryBorders,
    ];

    globe.pathPoints((datum: unknown) => (
      isCountryBorder(datum) ? datum.points : resolveAccessor(originalPoints, datum)
    ));
    globe.pathPointAlt((point: unknown, index?: number, path?: unknown) => {
      if (isCountryBorder(path)) return BORDER_ALTITUDE;
      if (typeof originalPointAlt === 'function') {
        return (originalPointAlt as (p: unknown, i?: number, d?: unknown) => unknown)(point, index, path);
      }
      return originalPointAlt;
    });
    globe.pathColor((datum: unknown) => (
      isCountryBorder(datum) ? this.countryBorderColor() : resolveAccessor(originalColor, datum)
    ));
    globe.pathStroke((datum: unknown) => (
      isCountryBorder(datum) ? this.countryBorderStroke() : resolveAccessor(originalStroke, datum)
    ));
    globe.pathDashLength((datum: unknown) => (
      isCountryBorder(datum) ? 1 : resolveAccessor(originalDashLength, datum)
    ));
    globe.pathDashGap((datum: unknown) => (
      isCountryBorder(datum) ? 0 : resolveAccessor(originalDashGap, datum)
    ));
    globe.pathDashAnimateTime((datum: unknown) => (
      isCountryBorder(datum) ? 0 : resolveAccessor(originalDashAnimateTime, datum)
    ));
    if (typeof globe.pathLabel === 'function') {
      globe.pathLabel((datum: unknown) => (
        isCountryBorder(datum) ? '' : resolveAccessor(originalLabel, datum)
      ));
    }

    globe.pathsData = ((data?: unknown[]) => {
      if (data === undefined) return originalPathsData();
      return originalPathsData(withBorders(Array.isArray(data) ? data : []));
    }) as typeof globe.pathsData;

    const current = originalPathsData();
    originalPathsData(withBorders(Array.isArray(current) ? current : []));

    this.restorePathsDataMethod = () => {
      globe.pathsData = originalPathsDataMethod;
    };
  }

  private refreshCountryBorders(): void {
    if (typeof this.globe.pathsData !== 'function') return;
    const current = this.globe.pathsData();
    this.globe.pathsData(Array.isArray(current) ? current : []);
    this.wakeGlobe();
  }

  private installCountryLabels(): void {
    const globe = this.globe;
    if (
      typeof globe.htmlElementsData !== 'function'
      || typeof globe.htmlLat !== 'function'
      || typeof globe.htmlLng !== 'function'
      || typeof globe.htmlAltitude !== 'function'
      || typeof globe.htmlElement !== 'function'
    ) {
      return;
    }

    const originalHtmlDataMethod = globe.htmlElementsData;
    const originalHtmlData = originalHtmlDataMethod.bind(globe);
    const originalLat = globe.htmlLat();
    const originalLng = globe.htmlLng();
    const originalAltitude = globe.htmlAltitude();
    const originalElement = globe.htmlElement();

    const isCountryLabel = (datum: unknown): datum is CountryLabelDatum => (
      Boolean(datum && typeof datum === 'object' && '_wmCountryLabel' in datum)
    );

    const withLabels = (data: unknown[]): unknown[] => [
      ...data.filter((item) => !isCountryLabel(item)),
      ...this.visibleLabels,
    ];

    globe.htmlLat((datum: unknown) => (
      isCountryLabel(datum) ? datum._lat : resolveAccessor(originalLat, datum)
    ));
    globe.htmlLng((datum: unknown) => (
      isCountryLabel(datum) ? datum._lng : resolveAccessor(originalLng, datum)
    ));
    globe.htmlAltitude((datum: unknown) => (
      isCountryLabel(datum) ? LABEL_ALTITUDE : resolveAccessor(originalAltitude, datum)
    ));
    globe.htmlElement((datum: unknown) => {
      if (isCountryLabel(datum)) return this.buildCountryLabelElement(datum);
      return resolveAccessor(originalElement, datum);
    });

    globe.htmlElementsData = ((data?: unknown[]) => {
      if (data === undefined) return originalHtmlData();
      return originalHtmlData(withLabels(Array.isArray(data) ? data : []));
    }) as typeof globe.htmlElementsData;

    this.updateCountryLabels();

    const controls = globe.controls?.();
    if (controls?.addEventListener) {
      this.controlsLabelHandler = () => this.updateCountryLabels();
      controls.addEventListener('end', this.controlsLabelHandler);
    }

    this.restoreHtmlDataMethod = () => {
      globe.htmlElementsData = originalHtmlDataMethod;
    };
  }

  private buildCountryLabelElement(label: CountryLabelDatum): HTMLElement {
    const el = document.createElement('div');
    el.style.pointerEvents = 'none';
    el.style.userSelect = 'none';
    el.style.zIndex = '50';
    el.style.whiteSpace = 'nowrap';

    const text = document.createElement('span');
    text.textContent = label.text;
    Object.assign(text.style, {
      display: 'block',
      color: this.countryLabelColor(),
      fontFamily: 'inherit',
      fontSize: `${label.fontPx}px`,
      fontWeight: '800',
      letterSpacing: '0.035em',
      lineHeight: '1',
      whiteSpace: 'nowrap',
      WebkitTextStroke: '0.45px rgba(0, 0, 0, 0.94)',
      textShadow: [
        '-1px -1px 0 rgba(0,0,0,0.95)',
        '1px -1px 0 rgba(0,0,0,0.95)',
        '-1px 1px 0 rgba(0,0,0,0.95)',
        '1px 1px 0 rgba(0,0,0,0.95)',
        '0 2px 4px rgba(0,0,0,0.9)',
      ].join(','),
      opacity: '0.98',
    });

    el.appendChild(text);
    return el;
  }

  private updateCountryLabels(): void {
    if (typeof this.globe.htmlElementsData !== 'function') return;

    const altitude = this.globe.pointOfView?.().altitude ?? 1.8;
    const maxRank = altitude <= 0.72 ? 2 : altitude <= 1.25 ? 1 : 0;

    const fontFor = (rank: 0 | 1 | 2): number => {
      if (altitude <= 0.72) return rank === 0 ? 16 : rank === 1 ? 14 : 12;
      if (altitude <= 1.25) return rank === 0 ? 14 : 12;
      return 12;
    };

    this.visibleLabels = this.countryLabels
      .filter((label) => label.rank <= maxRank)
      .map((label) => ({ ...label, fontPx: fontFor(label.rank) }));

    const current = this.globe.htmlElementsData();
    this.globe.htmlElementsData(Array.isArray(current) ? current : []);
    this.wakeGlobe();
  }

  private countryBorderColor(): string {
    return getGlobeTexture() === 'topographic' ? '#57d2ff' : '#e9f3f8';
  }

  private countryBorderStroke(): number {
    return getGlobeTexture() === 'topographic' ? 0.16 : 0.13;
  }

  private countryLabelColor(): string {
    return getGlobeTexture() === 'topographic' ? '#e6f7ff' : '#ffffff';
  }

  private applySkin(texture: GlobeTexture): void {
    this.wakeGlobe();

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
  }

  public destroy(): void {
    this.transitionGeneration += 1;
    if (this.transitionFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.transitionFrame);
      this.transitionFrame = null;
    }
    if (this.controlsLabelHandler) {
      this.globe.controls?.()?.removeEventListener?.('end', this.controlsLabelHandler);
      this.controlsLabelHandler = null;
    }
    this.restorePathsDataMethod?.();
    this.restorePathsDataMethod = null;
    this.restoreHtmlDataMethod?.();
    this.restoreHtmlDataMethod = null;
    this.unsubscribeTexture?.();
    this.unsubscribeTexture = null;
    this.toggle?.remove();
    this.toggle = null;
  }
}
