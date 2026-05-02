import { Download, FolderOpen, Plus, Redo2, Save, Undo2 } from "lucide-react";
import { useEffect, useReducer, useState } from "react";

import {
  exportProject,
  importPointCloud,
  loadChunk,
  loadChunkMetadata,
  loadProject,
  previewMask,
  saveProject,
  uploadPointCloud
} from "./api";
import { LayerPanel } from "./components/LayerPanel";
import { PointCloudCanvas } from "./components/PointCloudCanvas";
import { SideSliceView } from "./components/SideSliceView";
import { editorReducer, initialEditorState } from "./maskState";
import type { ChunkMetadata, ExportKind, PointCloudMetadata, Project } from "./types";

interface ChunkPayload {
  id: number;
  data: Float32Array;
  mask: boolean[] | null;
}

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [sourcePath, setSourcePath] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [exportPath, setExportPath] = useState("");
  const [exportKind, setExportKind] = useState<ExportKind>("cloud");
  const [metadata, setMetadata] = useState<PointCloudMetadata | null>(null);
  const [chunkMetadata, setChunkMetadata] = useState<ChunkMetadata | null>(null);
  const [chunks, setChunks] = useState<ChunkPayload[]>([]);
  const [status, setStatus] = useState("Import a PCD or PLY file to begin.");
  const [busy, setBusy] = useState(false);

  const project = state.project;

  useEffect(() => {
    if (!project || chunks.length === 0) return;
    const timeout = window.setTimeout(async () => {
      try {
        const masks = await previewMask(
          project.cache_id,
          project,
          chunks.map((chunk) => chunk.id)
        );
        setChunks((current) =>
          current.map((chunk) => ({ ...chunk, mask: masks[chunk.id] ?? chunk.mask }))
        );
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Preview mask failed.");
      }
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [project, chunks.length]);

  async function hydrateProject(nextProject = project) {
    if (!nextProject) return;
    const nextMetadata = await loadChunkMetadata(nextProject.cache_id);
    const chunkBuffers = await Promise.all(
      nextMetadata.chunks.slice(0, 8).map(async (chunk) => ({
        id: chunk.id,
        data: await loadChunk(nextProject.cache_id, chunk.id),
        mask: null
      }))
    );
    setChunkMetadata(nextMetadata);
    setChunks(chunkBuffers);
  }

  async function applyImportResponse(response: Awaited<ReturnType<typeof importPointCloud>>) {
    dispatch({ type: "set-project", project: response.project });
    setMetadata(response.metadata);
    setProjectPath(`${response.project.source_path}.mapping.json`);
    setExportPath(
      response.project.source_format === "pcd"
        ? response.project.source_path.replace(/\.pcd$/i, ".pruned.pcd")
        : response.project.source_path.replace(/\.ply$/i, ".pruned.ply")
    );
    await hydrateProject(response.project);
    setStatus(`Loaded ${response.metadata.point_count.toLocaleString()} points.`);
  }

  async function handleImport() {
    setBusy(true);
    try {
      const response = await importPointCloud(sourcePath);
      await applyImportResponse(response);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const response = await uploadPointCloud(file);
      setSourcePath(response.project.source_path);
      await applyImportResponse(response);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadProject() {
    setBusy(true);
    try {
      const loaded = await loadProject(projectPath);
      dispatch({ type: "set-project", project: loaded });
      await hydrateProject(loaded);
      setStatus("Project loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Project load failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProject() {
    if (!project) return;
    setBusy(true);
    try {
      await saveProject(projectPath, project);
      setStatus(`Project saved to ${projectPath}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Project save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    if (!project) return;
    setBusy(true);
    try {
      const response = await exportProject(project, exportKind, exportPath);
      setStatus(
        `Exported ${response.kept_count.toLocaleString()} of ${response.total_count.toLocaleString()} points to ${response.target_path}.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <section className="panel">
          <div className="section-title">Import</div>
          <label>
            Source path
            <input
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
              placeholder="/path/to/map.pcd"
            />
          </label>
          <button disabled={!sourcePath || busy} onClick={handleImport}>
            <FolderOpen size={16} /> Import
          </button>
          <label className="file-import">
            Choose PCD/PLY file
            <input
              type="file"
              accept=".pcd,.ply"
              disabled={busy}
              onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
            />
          </label>
        </section>

        <section className="panel">
          <div className="section-title">Project</div>
          <label>
            Project JSON
            <input value={projectPath} onChange={(event) => setProjectPath(event.target.value)} />
          </label>
          <div className="button-row">
            <button disabled={!projectPath || busy} onClick={handleLoadProject} title="Load project">
              <FolderOpen size={16} />
            </button>
            <button disabled={!project || !projectPath || busy} onClick={handleSaveProject} title="Save project">
              <Save size={16} />
            </button>
          </div>
        </section>

        {project && (
          <>
            <section className="panel">
              <div className="section-title">Root Crop</div>
              <BoundsEditor
                bounds={project.root_crop}
                onChange={(bounds) => dispatch({ type: "set-root-crop", bounds })}
              />
            </section>

            <section className="panel">
              <div className="section-title">View</div>
              <div className="segmented">
                <button
                  className={project.view.side_plane === "xz" ? "active" : ""}
                  onClick={() => dispatch({ type: "set-side-plane", plane: "xz" })}
                >
                  XZ
                </button>
                <button
                  className={project.view.side_plane === "yz" ? "active" : ""}
                  onClick={() => dispatch({ type: "set-side-plane", plane: "yz" })}
                >
                  YZ
                </button>
              </div>
              <label>
                Slice thickness
                <input
                  type="number"
                  min="0.01"
                  step="0.1"
                  value={project.view.slice_thickness}
                  onChange={(event) =>
                    dispatch({ type: "set-slice-thickness", value: Number(event.target.value) })
                  }
                />
              </label>
            </section>

            <section className="panel">
              <div className="section-title">Layers</div>
              <div className="button-row">
                <button onClick={() => dispatch({ type: "add-layer", bounds: project.bounds })}>
                  <Plus size={16} /> Polygon
                </button>
                <button disabled={state.past.length === 0} onClick={() => dispatch({ type: "undo" })} title="Undo">
                  <Undo2 size={16} />
                </button>
                <button disabled={state.future.length === 0} onClick={() => dispatch({ type: "redo" })} title="Redo">
                  <Redo2 size={16} />
                </button>
              </div>
              <LayerPanel
                layers={project.layers}
                activeLayerId={state.activeLayerId}
                onActive={(id) => dispatch({ type: "set-active-layer", id })}
                onUpdate={(id, patch) => dispatch({ type: "update-layer", id, patch })}
                onDelete={(id) => dispatch({ type: "delete-layer", id })}
                onMove={(id, direction) => dispatch({ type: "move-layer", id, direction })}
              />
            </section>

            <section className="panel">
              <div className="section-title">Export</div>
              <div className="segmented">
                <button className={exportKind === "cloud" ? "active" : ""} onClick={() => setExportKind("cloud")}>
                  Cloud
                </button>
                <button className={exportKind === "mask" ? "active" : ""} onClick={() => setExportKind("mask")}>
                  Mask
                </button>
              </div>
              <label>
                Target path
                <input value={exportPath} onChange={(event) => setExportPath(event.target.value)} />
              </label>
              <button disabled={!exportPath || busy} onClick={handleExport}>
                <Download size={16} /> Export
              </button>
            </section>
          </>
        )}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <strong>Mapping Suite</strong>
            <span>{metadata ? `${metadata.source_format.toUpperCase()} · ${metadata.point_count.toLocaleString()} pts` : "Local point-cloud mask editor"}</span>
          </div>
          <output>{busy ? "Working..." : status}</output>
        </header>
        <div className="views">
          <PointCloudCanvas
            project={project}
            chunks={chunks}
            activeLayerId={state.activeLayerId}
            onCursor={(x, y) => dispatch({ type: "set-cursor", x, y })}
          />
          <SideSliceView project={project} chunks={chunks} chunkMetadata={chunkMetadata} />
        </div>
      </section>
    </main>
  );
}

function BoundsEditor({ bounds, onChange }: { bounds: Project["root_crop"]; onChange: (bounds: Project["root_crop"]) => void }) {
  const entries: Array<[keyof Project["root_crop"], string]> = [
    ["min_x", "Min X"],
    ["max_x", "Max X"],
    ["min_y", "Min Y"],
    ["max_y", "Max Y"],
    ["min_z", "Min Z"],
    ["max_z", "Max Z"]
  ];
  return (
    <div className="bounds-grid">
      {entries.map(([key, label]) => (
        <label key={String(key)}>
          {label}
          <input
            type="number"
            value={bounds[key]}
            onChange={(event) => onChange({ ...bounds, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}
