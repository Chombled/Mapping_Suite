import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Project } from "../types";

interface ChunkPayload {
  id: number;
  data: Float32Array;
  mask: boolean[] | null;
}

interface Props {
  project: Project | null;
  chunks: ChunkPayload[];
  activeLayerId: string | null;
  onCursor: (x: number, y: number) => void;
}

export function PointCloudCanvas({ project, chunks, activeLayerId, onCursor }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  const activeLayer = useMemo(
    () => project?.layers.find((layer) => layer.id === activeLayerId) ?? null,
    [project?.layers, activeLayerId]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#101417");
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10000, 10000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const container = containerRef.current;
    if (!scene || !renderer || !camera || !container || !project) return;

    scene.clear();
    scene.background = new THREE.Color("#101417");
    fitCamera(camera, project, container.clientWidth / Math.max(container.clientHeight, 1));

    for (const chunk of chunks) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array((chunk.data.length / 4) * 3);
      const colors = new Float32Array((chunk.data.length / 4) * 3);
      fillBirdseyeBuffers(chunk, project, positions, colors);
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({ size: 2, vertexColors: true, sizeAttenuation: false });
      scene.add(new THREE.Points(geometry, material));
    }

    if (activeLayer && activeLayer.polygon.length >= 3) {
      const points = [...activeLayer.polygon, activeLayer.polygon[0]].map(
        ([x, y]) => new THREE.Vector3(x, y, 1)
      );
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#f6c453" })));
    }

    renderer.render(scene, camera);
  }, [chunks, project, activeLayer]);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!project || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const u = (event.clientX - rect.left) / rect.width;
    const v = 1 - (event.clientY - rect.top) / rect.height;
    const x = project.bounds.min_x + u * (project.bounds.max_x - project.bounds.min_x);
    const y = project.bounds.min_y + v * (project.bounds.max_y - project.bounds.min_y);
    onCursor(x, y);
  }

  return (
    <div className="view-pane">
      <div className="view-label">Birdseye XY</div>
      <div className="three-host" ref={containerRef} onPointerMove={handlePointerMove}>
        {!project && <div className="placeholder">No map loaded</div>}
      </div>
    </div>
  );
}

function fitCamera(camera: THREE.OrthographicCamera, project: Project, aspect: number) {
  const width = project.bounds.max_x - project.bounds.min_x;
  const height = project.bounds.max_y - project.bounds.min_y;
  const cx = project.bounds.min_x + width / 2;
  const cy = project.bounds.min_y + height / 2;
  const paddedWidth = width * 1.08;
  const paddedHeight = height * 1.08;
  if (paddedWidth / Math.max(paddedHeight, 1e-6) > aspect) {
    camera.left = -paddedWidth / 2;
    camera.right = paddedWidth / 2;
    camera.top = paddedWidth / aspect / 2;
    camera.bottom = -paddedWidth / aspect / 2;
  } else {
    camera.top = paddedHeight / 2;
    camera.bottom = -paddedHeight / 2;
    camera.left = (-paddedHeight * aspect) / 2;
    camera.right = (paddedHeight * aspect) / 2;
  }
  camera.position.set(cx, cy, 1000);
  camera.lookAt(cx, cy, 0);
  camera.updateProjectionMatrix();
}

function fillBirdseyeBuffers(
  chunk: ChunkPayload,
  project: Project,
  positions: Float32Array,
  colors: Float32Array
) {
  const bounds = project.bounds;
  const zRange = Math.max(bounds.max_z - bounds.min_z, 1e-6);
  let target = 0;
  for (let i = 0; i < chunk.data.length; i += 4) {
    const x = chunk.data[i];
    const y = chunk.data[i + 1];
    const z = chunk.data[i + 2];
    const value = chunk.data[i + 3];
    positions[target] = x;
    positions[target + 1] = y;
    positions[target + 2] = 0;

    const masked = chunk.mask?.[i / 4] === false;
    const normalized = project.view.color_mode === "height" ? (z - bounds.min_z) / zRange : normalizeIntensity(value);
    const color = masked ? [0.55, 0.13, 0.11] : heatColor(normalized);
    colors[target] = color[0];
    colors[target + 1] = color[1];
    colors[target + 2] = color[2];
    target += 3;
  }
}

function normalizeIntensity(value: number) {
  return Math.max(0, Math.min(1, value / 255));
}

function heatColor(value: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, value));
  return [0.1 + t * 0.8, 0.35 + (1 - Math.abs(t - 0.5) * 2) * 0.45, 0.75 - t * 0.55];
}
