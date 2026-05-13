# Mapping Suite

Custom local mapping suite for LiDAR-based SLAM maps.

This repository currently contains an MVP point-cloud mask editor:

- Python/FastAPI backend for `PCD`/`PLY` import, preview chunking, project JSON, exact mask evaluation, and export.
- React/TypeScript frontend with a birdseye XY view, side-slice view, root crop controls, polygon mask layers, undo/redo, and cloud or `.npy` mask export.
- Mask semantics: `true` means keep the point. The global XYZ crop is a hard outer bound.
  Enabled polygon layers build an ordered selection with `union`, `difference`, and
  `intersection`; if no polygon layers are enabled, only the root crop applies.

## Backend

```bash
cd backend
uv sync --extra dev
uv run uvicorn app.main:app --reload
```

The backend serves the API at `http://127.0.0.1:8000`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://127.0.0.1:5173` and proxies `/api` calls to the backend.

Point-cloud imports use the file picker. Selected maps are copied into
`.mapping_cache/uploads/` before preprocessing, and saved projects reference that cached copy.

## Verification

```bash
cd backend
uv run pytest
uv run ruff format --check .
uv run ruff check .

cd ../frontend
npm test
npm run build
```
