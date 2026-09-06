import { isMobileDevice } from '@/utils';
import type { MapView } from './MapContainer';
import { GlobeMap as GlobeMapCore } from './GlobeMapCore';

export type { GlobeMapOptions } from './GlobeMapCore';

// $MONITOR mobile camera treatment.
// Keep the globe renderer itself at full size so markers, hit-testing and
// OrbitControls remain perfectly aligned. Instead, move the default mobile
// camera far enough away that the projected globe diameter is 75% of the
// upstream/default size. Desktop and explicit zoom commands are untouched.
const MOBILE_GLOBE_PROJECTED_SCALE = 0.75;
const MOBILE_BOOT_CENTER_WINDOW_MS = 7_000;

const VIEW_POVS: Record<MapView, { lat: number; lng: number; altitude: number }> = {
  global:   { lat: 20,  lng: 0,   altitude: 1.8 },
  america:  { lat: 20,  lng: -90, altitude: 1.5 },
  mena:     { lat: 25,  lng: 40,  altitude: 1.2 },
  eu:       { lat: 50,  lng: 10,  altitude: 1.2 },
  asia:     { lat: 35,  lng: 105, altitude: 1.5 },
  latam:    { lat: -15, lng: -60, altitude: 1.5 },
  africa:   { lat: 5,   lng: 20,  altitude: 1.5 },
  oceania:  { lat: -25, lng: 140, altitude: 1.5 },
};

/**
 * globe.gl altitude is camera height in globe radii above the surface.
 * Perspective projection scales a sphere by 1 / sqrt(distance^2 - radius^2),
 * so solve for the camera distance that produces exactly 75% of the old
 * projected diameter rather than approximating with a CSS transform.
 */
function mobileDefaultAltitude(altitude: number): number {
  const cameraDistance = 1 + altitude;
  const tangentDistance = Math.sqrt(Math.max(0, cameraDistance * cameraDistance - 1));
  const scaledTangentDistance = tangentDistance / MOBILE_GLOBE_PROJECTED_SCALE;
  return Math.sqrt(1 + scaledTangentDistance * scaledTangentDistance) - 1;
}

function hasExplicitUrlCenter(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('lat') || params.has('lon');
}

type GlobeRuntime = {
  currentView: MapView;
  globe: unknown | null;
  wakeGlobe: () => void;
  moveViewport: (
    target: { lat: number; lng: number; altitude: number },
    durationMs?: number,
  ) => void;
};

/**
 * Thin $MONITOR wrapper around the upstream globe implementation.
 * The base constructor calls setView() during globe initialization, so this
 * override also owns the very first mobile frame as well as the Home/reset
 * button. Explicit zooms continue through the upstream implementation.
 */
export class GlobeMap extends GlobeMapCore {
  private readonly mobileBootStartedAt = Date.now();
  private mobileBootCenterHandled = false;

  public override setView(view: MapView, zoom?: number): void {
    if (!isMobileDevice() || zoom !== undefined) {
      super.setView(view, zoom);
      return;
    }

    // GlobeMapCore keeps these implementation details private. They are normal
    // runtime properties/methods (not #private), so the wrapper can reuse the
    // existing movement/settlement path without duplicating renderer behavior.
    const runtime = this as unknown as GlobeRuntime;
    runtime.currentView = view;
    if (!runtime.globe) return;

    runtime.wakeGlobe();
    const preset = VIEW_POVS[view] ?? VIEW_POVS.global;
    runtime.moveViewport({
      lat: preset.lat,
      lng: preset.lng,
      altitude: mobileDefaultAltitude(preset.altitude),
    });
  }

  public override setCenter(lat: number, lon: number, zoom?: number): void {
    // App startup asks mobile maps to center on precise device coordinates at
    // zoom 6 after the globe has already initialized. That second command was
    // silently replacing the smaller $MONITOR camera, which is why pressing
    // Home immediately produced the correct size. Preserve the geolocation
    // center, but keep the exact same camera distance as Home/reset.
    //
    // Scope this narrowly to the one startup command: explicit lat/lon URL
    // deep-links retain their requested zoom, and normal later setCenter calls
    // continue through the upstream implementation unchanged.
    const isStartupGeoCenter = isMobileDevice()
      && !this.mobileBootCenterHandled
      && zoom === 6
      && !hasExplicitUrlCenter()
      && Date.now() - this.mobileBootStartedAt <= MOBILE_BOOT_CENTER_WINDOW_MS;

    if (!isStartupGeoCenter) {
      super.setCenter(lat, lon, zoom);
      return;
    }

    this.mobileBootCenterHandled = true;
    const runtime = this as unknown as GlobeRuntime;
    if (!runtime.globe) {
      super.setCenter(lat, lon, zoom);
      return;
    }

    runtime.wakeGlobe();
    const preset = VIEW_POVS[runtime.currentView] ?? VIEW_POVS.global;
    runtime.moveViewport({
      lat,
      lng: lon,
      altitude: mobileDefaultAltitude(preset.altitude),
    });
  }
}
