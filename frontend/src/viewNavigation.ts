import type { Bounds } from "./types";

export interface BirdseyeViewport {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export function fitBoundsViewport(bounds: Bounds, aspect: number, padding = 1.08): BirdseyeViewport {
  const boundsWidth = Math.max(bounds.max_x - bounds.min_x, 1e-6);
  const boundsHeight = Math.max(bounds.max_y - bounds.min_y, 1e-6);
  const targetWidth = boundsWidth * padding;
  const targetHeight = boundsHeight * padding;

  let width = targetWidth;
  let height = targetWidth / Math.max(aspect, 1e-6);
  if (height < targetHeight) {
    height = targetHeight;
    width = targetHeight * Math.max(aspect, 1e-6);
  }

  return {
    centerX: bounds.min_x + boundsWidth / 2,
    centerY: bounds.min_y + boundsHeight / 2,
    width,
    height
  };
}

export function resizeViewport(viewport: BirdseyeViewport, aspect: number): BirdseyeViewport {
  return {
    ...viewport,
    height: viewport.width / Math.max(aspect, 1e-6)
  };
}

export function screenToWorld(
  viewport: BirdseyeViewport,
  screenX: number,
  screenY: number,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number } {
  const u = screenX / Math.max(screenWidth, 1);
  const v = screenY / Math.max(screenHeight, 1);
  return {
    x: viewport.centerX - viewport.width / 2 + u * viewport.width,
    y: viewport.centerY + viewport.height / 2 - v * viewport.height
  };
}

export function zoomViewport(
  viewport: BirdseyeViewport,
  focus: { x: number; y: number },
  zoomFactor: number,
  minWidth: number,
  maxWidth: number
): BirdseyeViewport {
  const clampedFactor = Math.max(0.05, Math.min(20, zoomFactor));
  const nextWidth = clamp(viewport.width * clampedFactor, minWidth, maxWidth);
  const appliedFactor = nextWidth / viewport.width;
  const nextHeight = viewport.height * appliedFactor;

  return {
    centerX: focus.x - (focus.x - viewport.centerX) * appliedFactor,
    centerY: focus.y - (focus.y - viewport.centerY) * appliedFactor,
    width: nextWidth,
    height: nextHeight
  };
}

export function panViewport(
  viewport: BirdseyeViewport,
  deltaScreenX: number,
  deltaScreenY: number,
  screenWidth: number,
  screenHeight: number
): BirdseyeViewport {
  return {
    ...viewport,
    centerX: viewport.centerX - (deltaScreenX / Math.max(screenWidth, 1)) * viewport.width,
    centerY: viewport.centerY + (deltaScreenY / Math.max(screenHeight, 1)) * viewport.height
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
