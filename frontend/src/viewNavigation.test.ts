import { describe, expect, it } from "vitest";

import { fitBoundsViewport, panViewport, screenToWorld, zoomViewport } from "./viewNavigation";
import type { Bounds } from "./types";

const bounds: Bounds = {
  min_x: 0,
  max_x: 100,
  min_y: 0,
  max_y: 50,
  min_z: 0,
  max_z: 10
};

describe("viewNavigation", () => {
  it("fits bounds while matching the canvas aspect", () => {
    const viewport = fitBoundsViewport(bounds, 2, 1);
    expect(viewport.centerX).toBe(50);
    expect(viewport.centerY).toBe(25);
    expect(viewport.width).toBe(100);
    expect(viewport.height).toBe(50);
  });

  it("converts screen coordinates through the active viewport", () => {
    const world = screenToWorld(
      { centerX: 10, centerY: 20, width: 100, height: 50 },
      50,
      25,
      100,
      50
    );
    expect(world).toEqual({ x: 10, y: 20 });
  });

  it("zooms around the cursor focus point", () => {
    const viewport = { centerX: 0, centerY: 0, width: 100, height: 100 };
    const zoomed = zoomViewport(viewport, { x: 25, y: 0 }, 0.5, 1, 1000);
    expect(zoomed.width).toBe(50);
    expect(zoomed.centerX).toBe(12.5);
    expect(zoomed.centerY).toBe(0);
  });

  it("pans opposite the pointer drag in world space", () => {
    const viewport = { centerX: 0, centerY: 0, width: 100, height: 50 };
    const panned = panViewport(viewport, 10, -10, 100, 50);
    expect(panned.centerX).toBe(-10);
    expect(panned.centerY).toBe(-10);
  });
});
