import { useEffect, useRef } from "react";

import type { ChunkMetadata, Project } from "../types";

interface ChunkPayload {
  id: number;
  data: Float32Array;
  mask: boolean[] | null;
}

interface Props {
  project: Project | null;
  chunks: ChunkPayload[];
  chunkMetadata: ChunkMetadata | null;
}

export function SideSliceView({ project, chunks, chunkMetadata }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const width = canvas.clientWidth * window.devicePixelRatio;
    const height = canvas.clientHeight * window.devicePixelRatio;
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#101417";
    context.fillRect(0, 0, width, height);

    if (!project) {
      context.fillStyle = "#7d8992";
      context.fillText("No map loaded", 20, 28);
      return;
    }

    const plane = project.view.side_plane;
    const cursor = plane === "xz" ? project.view.cursor_y : project.view.cursor_x;
    if (cursor == null) {
      context.fillStyle = "#7d8992";
      context.fillText("Move over birdseye view to inspect a slice", 20, 28);
      return;
    }

    const horizontalMin = plane === "xz" ? project.bounds.min_x : project.bounds.min_y;
    const horizontalMax = plane === "xz" ? project.bounds.max_x : project.bounds.max_y;
    const zMin = project.bounds.min_z;
    const zMax = project.bounds.max_z;
    const halfThickness = project.view.slice_thickness / 2;

    for (const chunk of chunks) {
      for (let i = 0; i < chunk.data.length; i += 4) {
        const x = chunk.data[i];
        const y = chunk.data[i + 1];
        const z = chunk.data[i + 2];
        const cross = plane === "xz" ? y : x;
        if (Math.abs(cross - cursor) > halfThickness) continue;

        const horizontal = plane === "xz" ? x : y;
        const px = ((horizontal - horizontalMin) / Math.max(horizontalMax - horizontalMin, 1e-6)) * width;
        const py = height - ((z - zMin) / Math.max(zMax - zMin, 1e-6)) * height;
        context.fillStyle = chunk.mask?.[i / 4] === false ? "#a43a32" : "#68c2dd";
        context.fillRect(px, py, 2, 2);
      }
    }

    context.strokeStyle = "#f6c453";
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, width - 1, height - 1);
  }, [project, chunks, chunkMetadata]);

  return (
    <div className="view-pane side">
      <div className="view-label">
        Side slice {project ? project.view.side_plane.toUpperCase() : ""}{" "}
        {chunkMetadata ? `· ${chunkMetadata.chunks.length} preview chunks` : ""}
      </div>
      <canvas ref={canvasRef} />
    </div>
  );
}
