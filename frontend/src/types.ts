export type LayerOperation = "add" | "subtract" | "intersect";
export type ExportKind = "cloud" | "mask";
export type SidePlane = "xz" | "yz";

export interface Bounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  min_z: number;
  max_z: number;
}

export interface PolygonLayer {
  id: string;
  name: string;
  operation: LayerOperation;
  enabled: boolean;
  polygon: Array<[number, number]>;
  z_min: number;
  z_max: number;
}

export interface ViewSettings {
  side_plane: SidePlane;
  slice_thickness: number;
  cursor_x: number | null;
  cursor_y: number | null;
  color_mode: "intensity" | "height";
}

export interface ExportPreferences {
  kind: ExportKind;
  target_path: string | null;
}

export interface Project {
  source_path: string;
  source_format: "pcd" | "ply";
  cache_id: string;
  fields: string[];
  bounds: Bounds;
  root_crop: Bounds;
  layers: PolygonLayer[];
  view: ViewSettings;
  export: ExportPreferences;
}

export interface PointCloudMetadata {
  source_path: string;
  source_format: "pcd" | "ply";
  point_count: number;
  fields: string[];
  has_intensity: boolean;
  has_rgb: boolean;
  bounds: Bounds;
}

export interface ImportResponse {
  metadata: PointCloudMetadata;
  project: Project;
}

export interface ChunkSummary {
  id: number;
  point_count: number;
  bounds: Bounds;
}

export interface ChunkMetadata {
  cache_id: string;
  point_stride_bytes: number;
  attributes: string[];
  chunks: ChunkSummary[];
}

export interface ExportResponse {
  target_path: string;
  total_count: number;
  kept_count: number;
}
