export type PolygonPoint = [number, number];

export const CLICK_DISTANCE_PX = 4;
export const CLOSE_HIT_RADIUS_PX = 12;
export const VERTEX_HIT_RADIUS_PX = 9;

export function isClickDistance(
  start: { x: number; y: number },
  end: { x: number; y: number },
  thresholdPx = CLICK_DISTANCE_PX
): boolean {
  return distancePx(start, end) <= thresholdPx;
}

export function isCloseToFirstVertex(
  screenPoint: { x: number; y: number },
  firstVertexScreenPoint: { x: number; y: number },
  vertexCount: number,
  radiusPx = CLOSE_HIT_RADIUS_PX
): boolean {
  return vertexCount >= 3 && distancePx(screenPoint, firstVertexScreenPoint) <= radiusPx;
}

export function replacePolygonVertex(
  polygon: PolygonPoint[],
  index: number,
  point: PolygonPoint
): PolygonPoint[] {
  return polygon.map((vertex, vertexIndex) => (vertexIndex === index ? point : vertex));
}

export function findHitVertex(
  screenPoint: { x: number; y: number },
  vertexScreenPoints: Array<{ x: number; y: number }>,
  radiusPx = VERTEX_HIT_RADIUS_PX
): number | null {
  let hitIndex: number | null = null;
  let hitDistance = radiusPx;

  vertexScreenPoints.forEach((vertex, index) => {
    const nextDistance = distancePx(screenPoint, vertex);
    if (nextDistance <= hitDistance) {
      hitIndex = index;
      hitDistance = nextDistance;
    }
  });

  return hitIndex;
}

function distancePx(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
