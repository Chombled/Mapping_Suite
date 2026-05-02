from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

from app.models import Bounds, ChunkMetadata, ChunkSummary
from app.pointcloud import PointCloudData, read_point_cloud

DEFAULT_CACHE_ROOT = Path(".mapping_cache")
UPLOAD_DIR = "uploads"
PREVIEW_POINT_TARGET = 300_000
CHUNK_SIZE = 50_000


def cache_root(path: str | None = None) -> Path:
    return Path(path) if path else DEFAULT_CACHE_ROOT


def upload_root(path: str | None = None) -> Path:
    root = cache_root(path) / UPLOAD_DIR
    root.mkdir(parents=True, exist_ok=True)
    return root


def cache_id_for_source(path: str | Path) -> str:
    source = Path(path).resolve()
    stat = source.stat()
    payload = f"{source}:{stat.st_size}:{stat.st_mtime_ns}".encode()
    return hashlib.sha256(payload).hexdigest()[:16]


def build_cache(source_path: str | Path, root: str | None = None) -> tuple[str, ChunkMetadata]:
    source = Path(source_path)
    cloud = read_point_cloud(source)
    cache_id = cache_id_for_source(source)
    directory = cache_root(root) / cache_id
    directory.mkdir(parents=True, exist_ok=True)

    stride = max(1, int(np.ceil(cloud.points.shape[0] / PREVIEW_POINT_TARGET)))
    preview = cloud.points[::stride]
    if cloud.intensity is not None:
        color = cloud.intensity[::stride].astype(np.float32)
    else:
        color = preview[:, 2].astype(np.float32)

    chunks: list[ChunkSummary] = []
    for chunk_id, start in enumerate(range(0, preview.shape[0], CHUNK_SIZE)):
        end = min(start + CHUNK_SIZE, preview.shape[0])
        xyz = preview[start:end].astype(np.float32, copy=False)
        xyzi = np.column_stack([xyz, color[start:end]]).astype(np.float32)
        np.save(directory / f"chunk_{chunk_id}.npy", xyzi)
        chunks.append(
            ChunkSummary(id=chunk_id, point_count=xyzi.shape[0], bounds=_bounds_from_points(xyz))
        )

    metadata = ChunkMetadata(cache_id=cache_id, chunks=chunks)
    (directory / "metadata.json").write_text(metadata.model_dump_json(indent=2), encoding="utf-8")
    (directory / "source.json").write_text(
        json.dumps({"source_path": str(source.resolve()), "stride": stride}, indent=2),
        encoding="utf-8",
    )
    return cache_id, metadata


def read_chunk_metadata(cache_id: str, root: str | None = None) -> ChunkMetadata:
    metadata_path = cache_root(root) / cache_id / "metadata.json"
    return ChunkMetadata.model_validate_json(metadata_path.read_text(encoding="utf-8"))


def read_chunk(cache_id: str, chunk_id: int, root: str | None = None) -> np.ndarray:
    chunk_path = cache_root(root) / cache_id / f"chunk_{chunk_id}.npy"
    return np.load(chunk_path)


def load_project_cloud(project_source_path: str) -> PointCloudData:
    return read_point_cloud(project_source_path)


def _bounds_from_points(points: np.ndarray) -> Bounds:
    mins = points.min(axis=0)
    maxs = points.max(axis=0)
    return Bounds(
        min_x=float(mins[0]),
        max_x=float(maxs[0]),
        min_y=float(mins[1]),
        max_y=float(maxs[1]),
        min_z=float(mins[2]),
        max_z=float(maxs[2]),
    )
