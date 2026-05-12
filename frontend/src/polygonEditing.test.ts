import { describe, expect, it } from "vitest";

import {
  findHitVertex,
  isPointInPolygon,
  isClickDistance,
  isCloseToFirstVertex,
  replacePolygonVertex
} from "./polygonEditing";

describe("polygon editing helpers", () => {
  it("distinguishes clicks from drags", () => {
    expect(isClickDistance({ x: 10, y: 10 }, { x: 13, y: 12 })).toBe(true);
    expect(isClickDistance({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(false);
  });

  it("only closes near the first vertex after three points", () => {
    const pointer = { x: 21, y: 23 };
    const firstVertex = { x: 20, y: 20 };
    expect(isCloseToFirstVertex(pointer, firstVertex, 2)).toBe(false);
    expect(isCloseToFirstVertex(pointer, firstVertex, 3)).toBe(true);
    expect(isCloseToFirstVertex({ x: 40, y: 40 }, firstVertex, 3)).toBe(false);
  });

  it("replaces a single polygon vertex", () => {
    expect(
      replacePolygonVertex(
        [
          [0, 0],
          [1, 1],
          [2, 2]
        ],
        1,
        [5, 6]
      )
    ).toEqual([
      [0, 0],
      [5, 6],
      [2, 2]
    ]);
  });

  it("finds the closest vertex inside the hit radius", () => {
    expect(
      findHitVertex({ x: 13, y: 13 }, [
        { x: 10, y: 10 },
        { x: 15, y: 15 }
      ])
    ).toBe(1);
    expect(findHitVertex({ x: 40, y: 40 }, [{ x: 10, y: 10 }])).toBeNull();
  });

  it("detects points inside polygon footprints", () => {
    const polygon: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4]
    ];
    expect(isPointInPolygon([2, 2], polygon)).toBe(true);
    expect(isPointInPolygon([5, 2], polygon)).toBe(false);
    expect(isPointInPolygon([2, 2], polygon.slice(0, 2))).toBe(false);
  });
});
