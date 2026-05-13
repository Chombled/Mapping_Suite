import type { ChunkMetadata, ExportKind, ExportResponse, ImportResponse, Project } from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

async function assertOk(response: Response): Promise<Response> {
  if (response.ok) {
    return response;
  }
  const payload = await response.json().catch(() => ({ detail: response.statusText }));
  throw new Error(payload.detail ?? response.statusText);
}

export async function uploadPointCloud(file: File): Promise<ImportResponse> {
  const body = new FormData();
  body.append("file", file);
  const response = await assertOk(
    await fetch("/api/import/upload", {
      method: "POST",
      body
    })
  );
  return response.json();
}

export async function loadChunkMetadata(cacheId: string): Promise<ChunkMetadata> {
  const response = await assertOk(await fetch(`/api/chunks/${cacheId}/metadata`));
  return response.json();
}

export async function loadChunk(cacheId: string, chunkId: number): Promise<Float32Array> {
  const response = await assertOk(await fetch(`/api/chunks/${cacheId}/${chunkId}`));
  return new Float32Array(await response.arrayBuffer());
}

export async function previewMask(
  cacheId: string,
  project: Project,
  chunkIds: number[]
): Promise<Record<number, boolean[]>> {
  const response = await assertOk(
    await fetch("/api/mask/preview", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ cache_id: cacheId, project, chunk_ids: chunkIds })
    })
  );
  const payload = await response.json();
  return payload.chunks;
}

export async function saveProject(path: string, project: Project): Promise<void> {
  await assertOk(
    await fetch("/api/projects/save", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ path, project })
    })
  );
}

export async function loadProject(path: string): Promise<Project> {
  const response = await assertOk(
    await fetch("/api/projects/load", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ path })
    })
  );
  return response.json();
}

export async function exportProject(
  project: Project,
  kind: ExportKind,
  targetPath: string
): Promise<ExportResponse> {
  const response = await assertOk(
    await fetch("/api/export", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ project, kind, target_path: targetPath })
    })
  );
  return response.json();
}
