from __future__ import annotations

from pathlib import Path
from typing import Annotated

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.cache import build_cache, read_chunk, read_chunk_metadata, upload_root
from app.errors import PointCloudError
from app.masking import evaluate_keep_mask
from app.models import (
    ExportRequest,
    ExportResponse,
    ImportRequest,
    ImportResponse,
    PreviewMaskRequest,
    PreviewMaskResponse,
    Project,
    ProjectPathRequest,
    ViewSettings,
)
from app.pointcloud import read_point_cloud, write_point_cloud

app = FastAPI(title="Mapping Suite API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/import", response_model=ImportResponse)
def import_point_cloud(request: ImportRequest) -> ImportResponse:
    try:
        source = Path(request.source_path).expanduser().resolve()
        return _import_from_source(source, request.cache_root)
    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Permission denied while reading '{request.source_path}'. "
                "Use the file picker import, move the file into this project folder, "
                "or start the backend from a terminal with permission to read that path."
            ),
        ) from exc
    except (OSError, PointCloudError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/import/upload", response_model=ImportResponse)
async def upload_point_cloud(file: Annotated[UploadFile, File()]) -> ImportResponse:
    filename = Path(file.filename or "pointcloud").name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pcd", ".ply"}:
        raise HTTPException(status_code=400, detail="Upload must be a .pcd or .ply file")

    target = upload_root() / filename
    if target.exists():
        stem = target.stem
        digest = abs(hash((filename, target.stat().st_mtime_ns))) % 1_000_000
        target = target.with_name(f"{stem}-{digest}{suffix}")

    try:
        with target.open("wb") as handle:
            while chunk := await file.read(1024 * 1024):
                handle.write(chunk)
        return _import_from_source(target.resolve(), None)
    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied while saving upload into '{target.parent}'.",
        ) from exc
    except (OSError, PointCloudError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _import_from_source(source: Path, cache_root: str | None) -> ImportResponse:
    cloud = read_point_cloud(source)
    cache_id, _ = build_cache(source, cache_root)
    metadata = cloud.metadata(str(source))
    project = Project(
        source_path=str(source),
        source_format=metadata.source_format,
        cache_id=cache_id,
        fields=metadata.fields,
        bounds=metadata.bounds,
        root_crop=metadata.bounds,
        view=ViewSettings(color_mode="intensity" if metadata.has_intensity else "height"),
    )
    return ImportResponse(metadata=metadata, project=project)


@app.get("/api/chunks/{cache_id}/metadata")
def chunk_metadata(cache_id: str):
    try:
        return read_chunk_metadata(cache_id)
    except OSError as exc:
        raise HTTPException(status_code=404, detail=f"Cache not found: {cache_id}") from exc


@app.get("/api/chunks/{cache_id}/{chunk_id}")
def chunk_payload(cache_id: str, chunk_id: int) -> Response:
    try:
        chunk = read_chunk(cache_id, chunk_id).astype(np.float32, copy=False)
    except OSError as exc:
        raise HTTPException(status_code=404, detail=f"Chunk not found: {chunk_id}") from exc
    return Response(content=chunk.tobytes(), media_type="application/octet-stream")


@app.post("/api/mask/preview", response_model=PreviewMaskResponse)
def preview_mask(request: PreviewMaskRequest) -> PreviewMaskResponse:
    try:
        metadata = read_chunk_metadata(request.cache_id)
        selected_ids = (
            request.chunk_ids
            if request.chunk_ids is not None
            else [chunk.id for chunk in metadata.chunks]
        )
        result: dict[int, list[bool]] = {}
        for chunk_id in selected_ids:
            chunk = read_chunk(request.cache_id, chunk_id)
            result[chunk_id] = evaluate_keep_mask(
                chunk[:, :3],
                request.project.root_crop,
                request.project.layers,
            ).tolist()
        return PreviewMaskResponse(chunks=result)
    except OSError as exc:
        raise HTTPException(status_code=404, detail=f"Cache not found: {request.cache_id}") from exc


@app.post("/api/projects/save")
def save_project(request: ProjectPathRequest) -> dict[str, str]:
    if request.project is None:
        raise HTTPException(status_code=400, detail="project is required")
    target = Path(request.path).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(request.project.model_dump_json(indent=2), encoding="utf-8")
    return {"path": str(target)}


@app.post("/api/projects/load", response_model=Project)
def load_project(request: ProjectPathRequest) -> Project:
    try:
        source = Path(request.path).expanduser().resolve()
        return Project.model_validate_json(source.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/export", response_model=ExportResponse)
def export_project(request: ExportRequest) -> ExportResponse:
    try:
        cloud = read_point_cloud(request.project.source_path)
        keep_mask = evaluate_keep_mask(
            cloud.points, request.project.root_crop, request.project.layers
        )
        target = Path(request.target_path).expanduser().resolve()
        target.parent.mkdir(parents=True, exist_ok=True)

        if request.kind == "mask":
            np.save(target, keep_mask)
            actual_target = (
                target.with_suffix(target.suffix + ".npy") if target.suffix != ".npy" else target
            )
        else:
            write_point_cloud(target, cloud, keep_mask)
            actual_target = target
    except (OSError, PointCloudError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ExportResponse(
        target_path=str(actual_target),
        total_count=int(keep_mask.shape[0]),
        kept_count=int(keep_mask.sum()),
    )
