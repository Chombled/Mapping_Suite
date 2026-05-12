from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

LayerOperation = Literal["union", "difference", "intersection"]
ExportKind = Literal["cloud", "mask"]
Plane = Literal["xz", "yz"]
SliceScope = Literal["full", "active_polygon"]


class Bounds(BaseModel):
    min_x: float
    max_x: float
    min_y: float
    max_y: float
    min_z: float
    max_z: float

    @field_validator("max_x")
    @classmethod
    def validate_x(cls, value: float, info: Any) -> float:
        if "min_x" in info.data and value < info.data["min_x"]:
            raise ValueError("max_x must be greater than or equal to min_x")
        return value

    @field_validator("max_y")
    @classmethod
    def validate_y(cls, value: float, info: Any) -> float:
        if "min_y" in info.data and value < info.data["min_y"]:
            raise ValueError("max_y must be greater than or equal to min_y")
        return value

    @field_validator("max_z")
    @classmethod
    def validate_z(cls, value: float, info: Any) -> float:
        if "min_z" in info.data and value < info.data["min_z"]:
            raise ValueError("max_z must be greater than or equal to min_z")
        return value


class PolygonLayer(BaseModel):
    id: str
    name: str
    operation: LayerOperation = "union"
    enabled: bool = True
    polygon: list[tuple[float, float]] = Field(default_factory=list)
    z_min: float
    z_max: float

    @field_validator("operation", mode="before")
    @classmethod
    def normalize_operation(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        return {
            "add": "union",
            "subtract": "difference",
            "intersect": "intersection",
        }.get(value, value)

    @field_validator("polygon")
    @classmethod
    def validate_polygon(cls, value: list[tuple[float, float]]) -> list[tuple[float, float]]:
        if value and len(value) < 3:
            raise ValueError("polygon layers require at least 3 vertices")
        return value

    @field_validator("z_max")
    @classmethod
    def validate_z_range(cls, value: float, info: Any) -> float:
        if "z_min" in info.data and value < info.data["z_min"]:
            raise ValueError("z_max must be greater than or equal to z_min")
        return value


class ViewSettings(BaseModel):
    side_plane: Plane = "xz"
    slice_thickness: float = 1.0
    slice_scope: SliceScope = "full"
    cursor_x: float | None = None
    cursor_y: float | None = None
    color_mode: Literal["intensity", "height"] = "intensity"


class ExportPreferences(BaseModel):
    kind: ExportKind = "cloud"
    target_path: str | None = None


class PointCloudMetadata(BaseModel):
    source_path: str
    source_format: Literal["pcd", "ply"]
    point_count: int
    fields: list[str]
    has_intensity: bool
    has_rgb: bool
    bounds: Bounds


class Project(BaseModel):
    source_path: str
    source_format: Literal["pcd", "ply"]
    cache_id: str
    fields: list[str]
    bounds: Bounds
    root_crop: Bounds
    layers: list[PolygonLayer] = Field(default_factory=list)
    view: ViewSettings = Field(default_factory=ViewSettings)
    export: ExportPreferences = Field(default_factory=ExportPreferences)


class ImportRequest(BaseModel):
    source_path: str
    cache_root: str | None = None


class ImportResponse(BaseModel):
    metadata: PointCloudMetadata
    project: Project


class ChunkSummary(BaseModel):
    id: int
    point_count: int
    bounds: Bounds


class ChunkMetadata(BaseModel):
    cache_id: str
    point_stride_bytes: int = 16
    attributes: list[str] = Field(default_factory=lambda: ["x", "y", "z", "intensity_or_height"])
    chunks: list[ChunkSummary]


class ProjectPathRequest(BaseModel):
    path: str
    project: Project | None = None


class PreviewMaskRequest(BaseModel):
    cache_id: str
    project: Project
    chunk_ids: list[int] | None = None


class PreviewMaskResponse(BaseModel):
    chunks: dict[int, list[bool]]


class ExportRequest(BaseModel):
    project: Project
    kind: ExportKind
    target_path: str

    @field_validator("target_path")
    @classmethod
    def validate_target_path(cls, value: str) -> str:
        if not value:
            raise ValueError("target_path is required")
        return str(Path(value))


class ExportResponse(BaseModel):
    target_path: str
    total_count: int
    kept_count: int
