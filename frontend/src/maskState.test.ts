import { describe, expect, it } from "vitest";

import { editorReducer, initialEditorState, operationLabel } from "./maskState";
import type { Project } from "./types";

const project: Project = {
  source_path: "/tmp/map.pcd",
  source_format: "pcd",
  cache_id: "cache",
  fields: ["x", "y", "z"],
  bounds: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 5 },
  root_crop: { min_x: 0, max_x: 10, min_y: 0, max_y: 10, min_z: 0, max_z: 5 },
  layers: [],
  view: { side_plane: "xz", slice_thickness: 1, cursor_x: null, cursor_y: null, color_mode: "height" },
  export: { kind: "cloud", target_path: null }
};

describe("editorReducer", () => {
  it("adds completed polygon layers and supports undo/redo", () => {
    const polygon: Array<[number, number]> = [
      [1, 1],
      [4, 1],
      [2, 3]
    ];
    const loaded = editorReducer(initialEditorState, { type: "set-project", project });
    const withLayer = editorReducer(loaded, { type: "add-layer", bounds: project.bounds, polygon });
    expect(withLayer.project?.layers).toHaveLength(1);
    expect(withLayer.project?.layers[0].polygon).toEqual(polygon);
    expect(withLayer.project?.layers[0].operation).toBe("union");
    expect(withLayer.project?.layers[0].z_min).toBe(project.bounds.min_z);
    expect(withLayer.project?.layers[0].z_max).toBe(project.bounds.max_z);

    const undone = editorReducer(withLayer, { type: "undo" });
    expect(undone.project?.layers).toHaveLength(0);

    const redone = editorReducer(undone, { type: "redo" });
    expect(redone.project?.layers).toHaveLength(1);
  });

  it("ignores invalid polygon layers", () => {
    const loaded = editorReducer(initialEditorState, { type: "set-project", project });
    const withInvalidLayer = editorReducer(loaded, {
      type: "add-layer",
      bounds: project.bounds,
      polygon: [
        [1, 1],
        [2, 2]
      ]
    });
    expect(withInvalidLayer.project?.layers).toHaveLength(0);
    expect(withInvalidLayer.past).toHaveLength(0);
  });

  it("does not add cursor movement to undo history", () => {
    const loaded = editorReducer(initialEditorState, { type: "set-project", project });
    const withCursor = editorReducer(loaded, { type: "set-cursor", x: 3, y: 4 });
    expect(withCursor.project?.view.cursor_x).toBe(3);
    expect(withCursor.project?.view.cursor_y).toBe(4);
    expect(withCursor.past).toHaveLength(0);
  });

  it("labels set operations", () => {
    expect(operationLabel("union")).toBe("Union");
    expect(operationLabel("difference")).toBe("Difference");
    expect(operationLabel("intersection")).toBe("Intersection");
  });
});
