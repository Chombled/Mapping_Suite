import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Project } from "../types";
import {
  type BirdseyeViewport,
  fitBoundsViewport,
  panViewport,
  resizeViewport,
  screenToWorld,
  zoomViewport
} from "../viewNavigation";

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
  const viewportRef = useRef<BirdseyeViewport | null>(null);
  const projectKeyRef = useRef<string | null>(null);
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  const activeLayer = useMemo(
    () => project?.layers.find((layer) => layer.id === activeLayerId) ?? null,
    [project?.layers, activeLayerId]
  );
  const projectKey = project ? `${project.source_path}:${project.cache_id}` : null;
  const colorMode = project?.view.color_mode;
  const bounds = project?.bounds;

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
      if (viewportRef.current) {
        viewportRef.current = resizeViewport(viewportRef.current, width / Math.max(height, 1));
        renderCurrentView();
      } else {
        renderer.render(scene, camera);
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      disposeScene(scene);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const container = containerRef.current;
    if (!scene || !container) return;

    if (!project) {
      projectKeyRef.current = null;
      viewportRef.current = null;
      disposeScene(scene);
      renderCurrentView();
      return;
    }

    if (projectKeyRef.current !== projectKey || !viewportRef.current) {
      projectKeyRef.current = projectKey;
      viewportRef.current = fitBoundsViewport(
        project.bounds,
        container.clientWidth / Math.max(container.clientHeight, 1)
      );
    }

    disposeScene(scene);
    scene.background = new THREE.Color("#101417");

    for (const chunk of chunks) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array((chunk.data.length / 4) * 3);
      const colors = new Float32Array((chunk.data.length / 4) * 3);
      fillBirdseyeBuffers(chunk, project, positions, colors);
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true,
        sizeAttenuation: false
      });
      scene.add(new THREE.Points(geometry, material));
    }

    if (activeLayer && activeLayer.polygon.length >= 3) {
      const points = [...activeLayer.polygon, activeLayer.polygon[0]].map(
        ([x, y]) => new THREE.Vector3(x, y, 1)
      );
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#f6c453" })));
    }

    renderCurrentView();
  }, [chunks, projectKey, colorMode, bounds, activeLayer]);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!project || !containerRef.current || !viewportRef.current) return;

    if (dragRef.current) {
      const drag = dragRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      viewportRef.current = panViewport(
        viewportRef.current,
        event.clientX - drag.lastX,
        event.clientY - drag.lastY,
        rect.width,
        rect.height
      );
      dragRef.current = { ...drag, lastX: event.clientX, lastY: event.clientY };
      renderCurrentView();
    }

    const world = pointerToWorld(event);
    if (world) {
      onCursor(world.x, world.y);
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!project || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!project || !viewportRef.current || !containerRef.current) return;
    event.preventDefault();
    const world = pointerToWorld(event);
    if (!world) return;
    const fullWidth = Math.max(project.bounds.max_x - project.bounds.min_x, 1e-6);
    const zoomFactor = Math.exp(event.deltaY * 0.001);
    viewportRef.current = zoomViewport(
      viewportRef.current,
      world,
      zoomFactor,
      fullWidth * 0.002,
      fullWidth * 50
    );
    renderCurrentView();
    onCursor(world.x, world.y);
  }

  function handleResetView() {
    resetView();
  }

  function resetView() {
    if (!project || !containerRef.current) return;
    viewportRef.current = fitBoundsViewport(
      project.bounds,
      containerRef.current.clientWidth / Math.max(containerRef.current.clientHeight, 1)
    );
    renderCurrentView();
  }

  function pointerToWorld(event: React.PointerEvent<HTMLDivElement> | React.WheelEvent<HTMLDivElement>) {
    if (!containerRef.current || !viewportRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return screenToWorld(
      viewportRef.current,
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height
    );
  }

  function renderCurrentView() {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const viewport = viewportRef.current;
    if (!scene || !renderer || !camera) return;
    if (viewport) {
      applyViewportToCamera(camera, viewport);
    }
    renderer.render(scene, camera);
  }

  return (
    <div className="view-pane">
      <div className="view-label view-label-actions">
        <span>Birdseye XY</span>
        <button disabled={!project} onClick={handleResetView} className="icon-button" title="Reset view">
          <RotateCcw size={14} />
        </button>
      </div>
      <div
        className={dragRef.current ? "three-host panning" : "three-host"}
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        {!project && <div className="placeholder">No map loaded</div>}
      </div>
    </div>
  );
}

function applyViewportToCamera(camera: THREE.OrthographicCamera, viewport: BirdseyeViewport) {
  camera.left = -viewport.width / 2;
  camera.right = viewport.width / 2;
  camera.top = viewport.height / 2;
  camera.bottom = -viewport.height / 2;
  camera.position.set(viewport.centerX, viewport.centerY, 1000);
  camera.lookAt(viewport.centerX, viewport.centerY, 0);
  camera.updateProjectionMatrix();
}

function disposeScene(scene: THREE.Scene) {
  for (const child of [...scene.children]) {
    scene.remove(child);
    disposeObject(child);
  }
  scene.clear();
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) {
        material.dispose();
      }
    } else {
      mesh.material?.dispose();
    }
  });
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
    const normalized =
      project.view.color_mode === "height" ? (z - bounds.min_z) / zRange : normalizeIntensity(value);
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
