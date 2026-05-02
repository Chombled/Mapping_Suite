import { describe, expect, it } from "vitest";

import { editorReducer, initialEditorState } from "./maskState";
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
  it("adds layers and supports undo/redo", () => {
    const loaded = editorReducer(initialEditorState, { type: "set-project", project });
    const withLayer = editorReducer(loaded, { type: "add-layer", bounds: project.bounds });
    expect(withLayer.project?.layers).toHaveLength(1);

    const undone = editorReducer(withLayer, { type: "undo" });
    expect(undone.project?.layers).toHaveLength(0);

    const redone = editorReducer(undone, { type: "redo" });
    expect(redone.project?.layers).toHaveLength(1);
  });
});
