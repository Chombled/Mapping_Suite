import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import {
  findHitVertex,
  isClickDistance,
  isCloseToFirstVertex,
  type PolygonPoint,
  replacePolygonVertex
} from "../polygonEditing";
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
  draftPolygon: PolygonPoint[] | null;
  onCursor: (x: number, y: number) => void;
  onDraftPoint: (point: PolygonPoint) => void;
  onDraftComplete: (polygon: PolygonPoint[]) => void;
  onVertexMove: (layerId: string, vertexIndex: number, point: PolygonPoint) => void;
}

interface PanDrag {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  hasPanned: boolean;
}

interface VertexDrag {
  pointerId: number;
  layerId: string;
  vertexIndex: number;
}

interface DragPreview {
  layerId: string;
  vertexIndex: number;
  point: PolygonPoint;
}

export function PointCloudCanvas({
  project,
  chunks,
  activeLayerId,
  draftPolygon,
  onCursor,
  onDraftPoint,
  onDraftComplete,
  onVertexMove
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const pointCloudGroupRef = useRef<THREE.Group | null>(null);
  const overlayGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const viewportRef = useRef<BirdseyeViewport | null>(null);
  const projectKeyRef = useRef<string | null>(null);
  const panDragRef = useRef<PanDrag | null>(null);
  const vertexDragRef = useRef<VertexDrag | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const activeLayer = useMemo(
    () => project?.layers.find((layer) => layer.id === activeLayerId) ?? null,
    [project?.layers, activeLayerId]
  );
  const projectKey = project ? `${project.source_path}:${project.cache_id}` : null;
  const colorMode = project?.view.color_mode;
  const bounds = project?.bounds;
  const layers = project?.layers;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#101417");
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10000, 10000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    const pointCloudGroup = new THREE.Group();
    const overlayGroup = new THREE.Group();
    scene.add(pointCloudGroup);
    scene.add(overlayGroup);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    sceneRef.current = scene;
    pointCloudGroupRef.current = pointCloudGroup;
    overlayGroupRef.current = overlayGroup;
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
      pointCloudGroupRef.current = null;
      overlayGroupRef.current = null;
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const pointCloudGroup = pointCloudGroupRef.current;
    const overlayGroup = overlayGroupRef.current;
    const container = containerRef.current;
    if (!pointCloudGroup || !overlayGroup || !container) return;

    if (!project) {
      projectKeyRef.current = null;
      viewportRef.current = null;
      disposeGroup(pointCloudGroup);
      disposeGroup(overlayGroup);
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

    disposeGroup(pointCloudGroup);

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
      pointCloudGroup.add(new THREE.Points(geometry, material));
    }

    renderCurrentView();
  }, [chunks, projectKey, colorMode, bounds]);

  useEffect(() => {
    const overlayGroup = overlayGroupRef.current;
    if (!overlayGroup) return;

    disposeGroup(overlayGroup);

    if (!layers) {
      renderCurrentView();
      return;
    }

    for (const layer of layers) {
      if (!layer.enabled || layer.polygon.length < 3) continue;
      const isActive = layer.id === activeLayerId;
      const polygon =
        dragPreview && dragPreview.layerId === layer.id
          ? replacePolygonVertex(layer.polygon, dragPreview.vertexIndex, dragPreview.point)
          : layer.polygon;
      addPolygonLine(overlayGroup, polygon, isActive ? "#f6c453" : "#7da7b5", isActive ? 3 : 2, true);
      if (isActive && draftPolygon === null) {
        addVertexHandles(overlayGroup, polygon, "#f6c453", 9, 4);
      }
    }

    if (draftPolygon !== null) {
      addPolygonLine(overlayGroup, draftPolygon, "#f6c453", 5, false);
      addVertexHandles(overlayGroup, draftPolygon, "#f6c453", 8, 6);
      if (draftPolygon.length >= 3) {
        addVertexHandles(overlayGroup, [draftPolygon[0]], "#edf4f7", 12, 7);
      }
    }

    renderCurrentView();
  }, [layers, activeLayerId, draftPolygon, dragPreview]);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!project || !containerRef.current || !viewportRef.current) return;

    if (vertexDragRef.current) {
      const world = pointerToWorld(event);
      if (world) {
        const preview = {
          ...vertexDragRef.current,
          point: [world.x, world.y] as PolygonPoint
        };
        dragPreviewRef.current = preview;
        setDragPreview(preview);
        onCursor(world.x, world.y);
      }
      return;
    }

    if (panDragRef.current) {
      const drag = panDragRef.current;
      if (
        !drag.hasPanned &&
        isClickDistance(
          { x: drag.startX, y: drag.startY },
          { x: event.clientX, y: event.clientY }
        )
      ) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      viewportRef.current = panViewport(
        viewportRef.current,
        event.clientX - drag.lastX,
        event.clientY - drag.lastY,
        rect.width,
        rect.height
      );
      panDragRef.current = {
        ...drag,
        lastX: event.clientX,
        lastY: event.clientY,
        hasPanned: true
      };
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
    const screen = pointerToScreen(event);

    if (screen && draftPolygon === null) {
      const vertexIndex = hitActiveVertex(screen);
      if (vertexIndex !== null && activeLayer) {
        vertexDragRef.current = {
          pointerId: event.pointerId,
          layerId: activeLayer.id,
          vertexIndex
        };
        return;
      }
    }

    panDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      hasPanned: false
    };
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (vertexDragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      const preview = dragPreviewRef.current;
      vertexDragRef.current = null;
      dragPreviewRef.current = null;
      setDragPreview(null);
      if (preview) {
        onVertexMove(preview.layerId, preview.vertexIndex, preview.point);
      }
      return;
    }

    if (panDragRef.current?.pointerId === event.pointerId) {
      const drag = panDragRef.current;
      event.currentTarget.releasePointerCapture(event.pointerId);
      panDragRef.current = null;
      if (
        draftPolygon !== null &&
        !drag.hasPanned &&
        isClickDistance(
          { x: drag.startX, y: drag.startY },
          { x: event.clientX, y: event.clientY }
        )
      ) {
        handleDraftClick(event);
      }
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

  function pointerToScreen(event: React.PointerEvent<HTMLDivElement>) {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function handleDraftClick(event: React.PointerEvent<HTMLDivElement>) {
    if (draftPolygon === null || !viewportRef.current || !containerRef.current) return;
    const screen = pointerToScreen(event);
    const world = pointerToWorld(event);
    if (!screen || !world) return;

    const rect = containerRef.current.getBoundingClientRect();
    const firstVertexScreenPoint =
      draftPolygon.length > 0
        ? worldToScreen(viewportRef.current, draftPolygon[0], rect.width, rect.height)
        : null;

    if (
      firstVertexScreenPoint &&
      isCloseToFirstVertex(screen, firstVertexScreenPoint, draftPolygon.length)
    ) {
      onDraftComplete(draftPolygon);
      return;
    }

    onDraftPoint([world.x, world.y]);
  }

  function hitActiveVertex(screen: { x: number; y: number }): number | null {
    if (!activeLayer?.enabled || !viewportRef.current || !containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const vertexScreenPoints = activeLayer.polygon.map((point) =>
      worldToScreen(viewportRef.current as BirdseyeViewport, point, rect.width, rect.height)
    );
    return findHitVertex(screen, vertexScreenPoints);
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
        className={draftPolygon !== null ? "three-host drawing" : "three-host"}
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

function worldToScreen(
  viewport: BirdseyeViewport,
  point: PolygonPoint,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number } {
  return {
    x: ((point[0] - (viewport.centerX - viewport.width / 2)) / viewport.width) * screenWidth,
    y: ((viewport.centerY + viewport.height / 2 - point[1]) / viewport.height) * screenHeight
  };
}

function addPolygonLine(
  target: THREE.Object3D,
  polygon: PolygonPoint[],
  color: string,
  z: number,
  closed: boolean
) {
  if (polygon.length < 2) return;
  const linePoints = closed && polygon.length >= 3 ? [...polygon, polygon[0]] : polygon;
  const points = linePoints.map(([x, y]) => new THREE.Vector3(x, y, z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  target.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color })));
}

function addVertexHandles(
  target: THREE.Object3D,
  polygon: PolygonPoint[],
  color: string,
  size: number,
  z: number
) {
  if (polygon.length === 0) return;
  const points = polygon.map(([x, y]) => new THREE.Vector3(x, y, z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  target.add(
    new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color, size, sizeAttenuation: false })
    )
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

function disposeGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
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
