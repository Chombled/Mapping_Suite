import type { ExportKind, Project } from "./types";

type ExportProjectInfo = Pick<Project, "source_format" | "source_path">;

const knownExportSuffixPattern = /\.(pcd|ply|npy)$/i;

export function exportPathForKind(
  path: string,
  project: ExportProjectInfo,
  kind: ExportKind
): string {
  const basePath = path || defaultExportPath(project, "cloud");
  return stripKnownExportSuffix(basePath) + exportSuffix(project, kind);
}

export function defaultExportPath(project: ExportProjectInfo, kind: ExportKind): string {
  return `${stripKnownExportSuffix(project.source_path)}.pruned${exportSuffix(project, kind)}`;
}

function exportSuffix(project: Pick<Project, "source_format">, kind: ExportKind): string {
  return kind === "mask" ? ".npy" : `.${project.source_format}`;
}

function stripKnownExportSuffix(path: string): string {
  return path.replace(knownExportSuffixPattern, "");
}
