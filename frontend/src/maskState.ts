import type { Bounds, LayerOperation, PolygonLayer, Project, SidePlane } from "./types";

export interface EditorState {
  past: Project[];
  project: Project | null;
  future: Project[];
  activeLayerId: string | null;
}

export type EditorAction =
  | { type: "set-project"; project: Project }
  | { type: "set-root-crop"; bounds: Bounds }
  | { type: "add-layer"; bounds: Bounds; polygon: Array<[number, number]> }
  | { type: "update-layer"; id: string; patch: Partial<PolygonLayer> }
  | { type: "delete-layer"; id: string }
  | { type: "set-active-layer"; id: string | null }
  | { type: "move-layer"; id: string; direction: -1 | 1 }
  | { type: "set-side-plane"; plane: SidePlane }
  | { type: "set-slice-thickness"; value: number }
  | { type: "set-cursor"; x: number; y: number }
  | { type: "undo" }
  | { type: "redo" };

export const initialEditorState: EditorState = {
  past: [],
  project: null,
  future: [],
  activeLayerId: null
};

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "set-project") {
    return { past: [], project: action.project, future: [], activeLayerId: null };
  }
  if (action.type === "undo") {
    const previous = state.past[state.past.length - 1];
    if (!previous || !state.project) return state;
    return {
      past: state.past.slice(0, -1),
      project: previous,
      future: [state.project, ...state.future],
      activeLayerId: state.activeLayerId
    };
  }
  if (action.type === "redo") {
    const next = state.future[0];
    if (!next || !state.project) return state;
    return {
      past: [...state.past, state.project],
      project: next,
      future: state.future.slice(1),
      activeLayerId: state.activeLayerId
    };
  }
  if (action.type === "set-active-layer") {
    return { ...state, activeLayerId: action.id };
  }
  if (!state.project) return state;
  if (action.type === "set-cursor") {
    return { ...state, project: reduceProject(state.project, action) };
  }

  const project = reduceProject(state.project, action);
  if (project === state.project) return state;
  return {
    past: [...state.past, state.project],
    project,
    future: [],
    activeLayerId:
      action.type === "add-layer" ? project.layers[project.layers.length - 1]?.id : state.activeLayerId
  };
}

function reduceProject(project: Project, action: EditorAction): Project {
  switch (action.type) {
    case "set-root-crop":
      return { ...project, root_crop: action.bounds };
    case "add-layer":
      if (action.polygon.length < 3) return project;
      return { ...project, layers: [...project.layers, createLayer(action.bounds, action.polygon)] };
    case "update-layer":
      return {
        ...project,
        layers: project.layers.map((layer) =>
          layer.id === action.id ? { ...layer, ...action.patch } : layer
        )
      };
    case "delete-layer":
      return { ...project, layers: project.layers.filter((layer) => layer.id !== action.id) };
    case "move-layer":
      return { ...project, layers: moveLayer(project.layers, action.id, action.direction) };
    case "set-side-plane":
      return { ...project, view: { ...project.view, side_plane: action.plane } };
    case "set-slice-thickness":
      return { ...project, view: { ...project.view, slice_thickness: action.value } };
    case "set-cursor":
      return { ...project, view: { ...project.view, cursor_x: action.x, cursor_y: action.y } };
    default:
      return project;
  }
}

function createLayer(bounds: Bounds, polygon: Array<[number, number]>): PolygonLayer {
  return {
    id: crypto.randomUUID(),
    name: "Polygon mask",
    operation: "subtract",
    enabled: true,
    polygon,
    z_min: bounds.min_z,
    z_max: bounds.max_z
  };
}

function moveLayer(layers: PolygonLayer[], id: string, direction: -1 | 1): PolygonLayer[] {
  const index = layers.findIndex((layer) => layer.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) return layers;
  const copy = [...layers];
  const [layer] = copy.splice(index, 1);
  copy.splice(nextIndex, 0, layer);
  return copy;
}

export function operationLabel(operation: LayerOperation): string {
  return operation === "add" ? "Add" : operation === "subtract" ? "Subtract" : "Intersect";
}
