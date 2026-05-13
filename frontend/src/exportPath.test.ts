import { describe, expect, it } from "vitest";

import { defaultExportPath, exportPathForKind } from "./exportPath";
import type { Project } from "./types";

const plyProject = {
  source_format: "ply",
  source_path: "/tmp/maps/source.ply"
} satisfies Pick<Project, "source_format" | "source_path">;

const pcdProject = {
  source_format: "pcd",
  source_path: "/tmp/maps/source.pcd"
} satisfies Pick<Project, "source_format" | "source_path">;

describe("exportPath", () => {
  it("switches PLY cloud export paths to NPY mask paths", () => {
    expect(exportPathForKind("/tmp/maps/source.pruned.ply", plyProject, "mask")).toBe(
      "/tmp/maps/source.pruned.npy"
    );
  });

  it("switches PCD cloud export paths to NPY mask paths", () => {
    expect(exportPathForKind("/tmp/maps/source.pruned.pcd", pcdProject, "mask")).toBe(
      "/tmp/maps/source.pruned.npy"
    );
  });

  it("switches mask paths back to the project source format for cloud export", () => {
    expect(exportPathForKind("/tmp/maps/source.pruned.npy", plyProject, "cloud")).toBe(
      "/tmp/maps/source.pruned.ply"
    );
    expect(exportPathForKind("/tmp/maps/source.pruned.npy", pcdProject, "cloud")).toBe(
      "/tmp/maps/source.pruned.pcd"
    );
  });

  it("preserves custom directories and basenames while switching suffixes", () => {
    expect(exportPathForKind("/custom/output/final-mask.PLY", plyProject, "mask")).toBe(
      "/custom/output/final-mask.npy"
    );
  });

  it("builds default pruned paths from the source path", () => {
    expect(defaultExportPath(plyProject, "cloud")).toBe("/tmp/maps/source.pruned.ply");
    expect(defaultExportPath(plyProject, "mask")).toBe("/tmp/maps/source.pruned.npy");
  });
});
