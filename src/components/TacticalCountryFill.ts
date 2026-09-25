import type { Geometry, Position } from 'geojson';
import { getCountriesGeoJson } from '@/services/country-geometry';
import {
  GLOBE_TEXTURE_URLS,
  getGlobeTexture,
  subscribeGlobeTextureChange,
  type GlobeTexture,
} from '@/services/globe-render-settings';

type GlobeMaterialRuntime = {
  color?: { set: (color: string) => void };
  emissive?: { set: (color: string) => void };
  emissiveIntensity?: number;
  needsUpdate?: boolean;
};

type GlobeRuntime = {
  globeImageUrl?: (url: string) => unknown;
  globeMaterial?: () => GlobeMaterialRuntime;
};

const TACTICAL_TEXTURE_WIDTH = 2048;
const TACTICAL_TEXTURE_HEIGHT = 1024;
const MAX_POINTS_PER_RING = 700;

function readFeatureCode(properties: Record<string, unknown> | null | undefined): string | null {
  if (!properties) return null;
  const raw = properties['ISO3166-1-Alpha-2'] ?? properties.ISO_A2 ?? properties.iso_a2;
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function tacticalCountryColor(code: string): string {
  const shades = ['#263b4d', '#2b4154', '#30485b'];
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = ((hash << 5) - hash) + code.charCodeAt(i);
  }
  return shades[Math.abs(hash) % shades.length] ?? '#263b4d';
}

function projectedPoint(
  point: Position,
  previousLng: number | null,
  wrapOffset: number,
): { x: number; y: number; lng: number; wrapOffset: number } | null {
  const rawLng = Number(point[0]);
  const lat = Number(point[1]);
  if (!Number.isFinite(rawLng) || !Number.isFinite(lat)) return null;

  let nextOffset = wrapOffset;
  if (previousLng !== null) {
    while ((rawLng + nextOffset) - previousLng > 180) nextOffset -= 360;
    while ((rawLng + nextOffset) - previousLng < -180) nextOffset += 360;
  }

  const lng = rawLng + nextOffset;
  return {
    x: ((lng + 180) / 360) * TACTICAL_TEXTURE_WIDTH,
    y: ((90 - lat) / 180) * TACTICAL_TEXTURE_HEIGHT,
    lng,
    wrapOffset: nextOffset,
  };
}

function traceRing(
  ctx: CanvasRenderingContext2D,
  ring: Position[],
  xShift: number,
): void {
  if (ring.length < 3) return;

  const step = Math.max(1, Math.floor(ring.length / MAX_POINTS_PER_RING));
  let previousLng: number | null = null;
  let wrapOffset = 0;
  let started = false;

  for (let i = 0; i < ring.length; i += step) {
    const point = ring[i];
    if (!point) continue;
    const projected = projectedPoint(point, previousLng, wrapOffset);
    if (!projected) continue;
    previousLng = projected.lng;
    wrapOffset = projected.wrapOffset;
    const x = projected.x + xShift;
    if (!started) {
      ctx.moveTo(x, projected.y);
      started = true;
    } else {
      ctx.lineTo(x, projected.y);
    }
  }

  const last = ring[ring.length - 1];
  if (last) {
    const projected = projectedPoint(last, previousLng, wrapOffset);
    if (projected) ctx.lineTo(projected.x + xShift, projected.y);
  }

  if (started) ctx.closePath();
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  rings: Position[][],
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = 'rgba(112, 178, 210, 0.18)';
  ctx.lineWidth = 0.8;

  for (const shift of [-TACTICAL_TEXTURE_WIDTH, 0, TACTICAL_TEXTURE_WIDTH]) {
    ctx.beginPath();
    for (const ring of rings) traceRing(ctx, ring, shift);
    ctx.fill('evenodd');
    ctx.stroke();
  }
}

function drawGeometry(
  ctx: CanvasRenderingContext2D,
  geometry: Geometry,
  fill: string,
): void {
  if (geometry.type === 'Polygon') {
    drawPolygon(ctx, geometry.coordinates, fill);
    return;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      drawPolygon(ctx, polygon, fill);
    }
  }
}

/**
 * Generates Tactical as a single equirectangular texture instead of hundreds
 * of live 3D country meshes. This keeps the flat intelligence-map appearance
 * while avoiding the large geometry/tessellation cost of globe.gl polygons.
 */
export class TacticalCountryFill {
  private unsubscribeTexture: (() => void) | null = null;
  private tacticalTextureUrl: string | null = null;

  public constructor(
    private readonly globe: GlobeRuntime,
    private readonly wakeGlobe: () => void,
  ) {}

  public async init(): Promise<void> {
    const countries = await getCountriesGeoJson();
    if (countries && typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = TACTICAL_TEXTURE_WIDTH;
        canvas.height = TACTICAL_TEXTURE_HEIGHT;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.fillStyle = '#071726';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          for (const feature of countries.features) {
            if (!feature.geometry) continue;
            const properties = (feature.properties ?? null) as Record<string, unknown> | null;
            const code = readFeatureCode(properties);
            if (!code) continue;
            drawGeometry(ctx, feature.geometry, tacticalCountryColor(code));
          }

          this.tacticalTextureUrl = canvas.toDataURL('image/png');
        }
      } catch (error) {
        console.warn('[TacticalCountryFill] Failed to generate tactical texture:', error);
      }
    }

    this.applyMode(getGlobeTexture());
    this.unsubscribeTexture = subscribeGlobeTextureChange((texture) => this.applyMode(texture));
  }

  private safeWake(): void {
    try {
      this.wakeGlobe();
    } catch {
      // Presentation-only updates should never block the rest of the globe.
    }
  }

  private applyMode(texture: GlobeTexture): void {
    const tactical = texture === 'topographic';
    const tacticalUrl = this.tacticalTextureUrl ?? GLOBE_TEXTURE_URLS.topographic;
    this.globe.globeImageUrl?.(tactical ? tacticalUrl : GLOBE_TEXTURE_URLS['blue-marble']);

    const material = this.globe.globeMaterial?.();
    if (material?.color?.set) material.color.set('#ffffff');
    if (material?.emissive?.set) {
      material.emissive.set(tactical ? '#06131f' : '#000000');
    }
    if (typeof material?.emissiveIntensity === 'number') {
      material.emissiveIntensity = tactical ? 0.10 : 0;
    }
    if (material) material.needsUpdate = true;
    this.safeWake();
  }

  public destroy(): void {
    this.unsubscribeTexture?.();
    this.unsubscribeTexture = null;
    this.tacticalTextureUrl = null;
  }
}
