# Mapping Suite

Custom local mapping suite for LiDAR-based SLAM maps.

This repository currently contains an MVP point-cloud mask editor:

- Python/FastAPI backend for `PCD`/`PLY` import, preview chunking, project JSON, exact mask evaluation, and export.
- React/TypeScript frontend with a birdseye XY view, side-slice view, root crop controls, polygon mask layers, undo/redo, and cloud or `.npy` mask export.
- Mask semantics: `true` means keep the point. The global XYZ crop is applied first, then ordered polygon layers apply `add`, `subtract`, or `intersect`.

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

Use the file picker when the backend cannot read a typed source path because of operating-system
permissions. Typed paths still reference the original file; file-picker imports copy the selected
map into `.mapping_cache/uploads/` before preprocessing.

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
