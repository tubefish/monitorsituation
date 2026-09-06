const GLOBE_ZOOM_ANCHORS = [
  { zoom: 1, altitude: 1.8 },
  { zoom: 2, altitude: 1.5 },
  // Named MENA/EU presets historically use altitude 1.2. Keeping it as an
  // explicit logical anchor makes their URL serialization round-trip exactly.
  { zoom: 2.5, altitude: 1.2 },
  { zoom: 3, altitude: 0.8 },
  { zoom: 4, altitude: 0.5 },
  { zoom: 5, altitude: 0.3 },
  { zoom: 6, altitude: 0.15 },
  { zoom: 7, altitude: 0.08 },
  { zoom: 8, altitude: 0.04 },
  { zoom: 9, altitude: 0.02 },
  { zoom: 10, altitude: 0.01 },
] as const;

const MIN_ZOOM = GLOBE_ZOOM_ANCHORS[0].zoom;
const MAX_ZOOM = GLOBE_ZOOM_ANCHORS[GLOBE_ZOOM_ANCHORS.length - 1]!.zoom;
const PHONE_PORTRAIT_MAX_WIDTH = 480;
const PHONE_PORTRAIT_GLOBAL_ALTITUDE = 3.2;

function isPhonePortraitViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= PHONE_PORTRAIT_MAX_WIDTH && window.innerHeight > window.innerWidth;
}

function anchorAltitude(index: number): number {
  const anchor = GLOBE_ZOOM_ANCHORS[index]!;
  if (index === 0 && isPhonePortraitViewport()) return PHONE_PORTRAIT_GLOBAL_ALTITUDE;
  return anchor.altitude;
}

function interpolateLogAltitude(
  zoom: number,
  fartherZoom: number,
  fartherAltitude: number,
  nearerZoom: number,
  nearerAltitude: number,
): number {
  const progress = (zoom - fartherZoom) / (nearerZoom - fartherZoom);
  return Math.exp(
    Math.log(fartherAltitude)
    + progress * (Math.log(nearerAltitude) - Math.log(fartherAltitude)),
  );
}

/** Converts the dashboard's logical 1-10 zoom scale to globe.gl altitude. */
export function mapZoomToGlobeAltitude(zoom: number | null | undefined): number {
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) {
    return anchorAltitude(0);
  }
  const boundedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  if (boundedZoom === MIN_ZOOM) return anchorAltitude(0);
  if (boundedZoom === MAX_ZOOM) {
    return anchorAltitude(GLOBE_ZOOM_ANCHORS.length - 1);
  }
  const exactAnchorIndex = GLOBE_ZOOM_ANCHORS.findIndex((anchor) => anchor.zoom === boundedZoom);
  if (exactAnchorIndex >= 0) return anchorAltitude(exactAnchorIndex);
  for (let index = 0; index < GLOBE_ZOOM_ANCHORS.length - 1; index += 1) {
    const farther = GLOBE_ZOOM_ANCHORS[index]!;
    const nearer = GLOBE_ZOOM_ANCHORS[index + 1]!;
    if (boundedZoom < farther.zoom || boundedZoom > nearer.zoom) continue;
    return interpolateLogAltitude(
      boundedZoom,
      farther.zoom,
      anchorAltitude(index),
      nearer.zoom,
      anchorAltitude(index + 1),
    );
  }
  return anchorAltitude(GLOBE_ZOOM_ANCHORS.length - 1);
}

/**
 * Converts globe.gl camera altitude into the dashboard's logical 1-10 zoom
 * scale. Interpolation keeps context honest after wheel/pinch zooms as well as
 * the exact altitude presets used by setView/setCenter.
 */
export function globeAltitudeToMapZoom(altitude: number | null | undefined): number {
  if (typeof altitude !== 'number' || !Number.isFinite(altitude)) return 1;
  if (altitude >= anchorAltitude(0)) return 1;
  const lastIndex = GLOBE_ZOOM_ANCHORS.length - 1;
  const last = GLOBE_ZOOM_ANCHORS[lastIndex]!;
  if (altitude <= anchorAltitude(lastIndex)) return last.zoom;
  const exactAnchorIndex = GLOBE_ZOOM_ANCHORS.findIndex(
    (_anchor, index) => anchorAltitude(index) === altitude,
  );
  if (exactAnchorIndex >= 0) return GLOBE_ZOOM_ANCHORS[exactAnchorIndex]!.zoom;

  for (let index = 0; index < GLOBE_ZOOM_ANCHORS.length - 1; index += 1) {
    const farther = GLOBE_ZOOM_ANCHORS[index]!;
    const nearer = GLOBE_ZOOM_ANCHORS[index + 1]!;
    const fartherAltitude = anchorAltitude(index);
    const nearerAltitude = anchorAltitude(index + 1);
    if (altitude > fartherAltitude || altitude < nearerAltitude) continue;
    const progress = (Math.log(fartherAltitude) - Math.log(altitude))
      / (Math.log(fartherAltitude) - Math.log(nearerAltitude));
    return farther.zoom + progress * (nearer.zoom - farther.zoom);
  }

  return 1;
}
