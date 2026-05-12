from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from tests.test_pointcloud import write_ascii_pcd


def test_import_preview_and_export_mask(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    source = tmp_path / "map.pcd"
    write_ascii_pcd(source)
    client = TestClient(app)

    import_response = client.post("/api/import", json={"source_path": str(source)})

    assert import_response.status_code == 200
    project = import_response.json()["project"]
    cache_id = project["cache_id"]

    metadata_response = client.get(f"/api/chunks/{cache_id}/metadata")
    assert metadata_response.status_code == 200
    assert metadata_response.json()["chunks"][0]["point_count"] == 3

    project["layers"] = [
        {
            "id": "layer-1",
            "name": "keep first",
            "operation": "union",
            "enabled": True,
            "polygon": [[-1, -1], [0.5, -1], [0.5, 0.5], [-1, 0.5]],
            "z_min": -1,
            "z_max": 1,
        }
    ]
    preview_response = client.post(
        "/api/mask/preview",
        json={"cache_id": cache_id, "project": project, "chunk_ids": [0]},
    )
    assert preview_response.status_code == 200
    assert preview_response.json()["chunks"]["0"] == [True, False, False]

    target = tmp_path / "mask.npy"
    export_response = client.post(
        "/api/export",
        json={"project": project, "kind": "mask", "target_path": str(target)},
    )
    assert export_response.status_code == 200
    assert export_response.json()["kept_count"] == 1
    assert np.load(target).tolist() == [True, False, False]


def test_upload_import_copies_file_into_cache(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    source = tmp_path / "upload.pcd"
    write_ascii_pcd(source)
    client = TestClient(app)

    with source.open("rb") as handle:
        response = client.post(
            "/api/import/upload",
            files={"file": ("upload.pcd", handle, "application/octet-stream")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["metadata"]["point_count"] == 3
    assert ".mapping_cache/uploads/upload.pcd" in payload["project"]["source_path"]


def test_project_load_defaults_missing_slice_scope(tmp_path: Path) -> None:
    project_path = tmp_path / "legacy.mapping.json"
    project_path.write_text(
        """
        {
          "source_path": "/tmp/map.pcd",
          "source_format": "pcd",
          "cache_id": "cache",
          "fields": ["x", "y", "z"],
          "bounds": {"min_x": 0, "max_x": 1, "min_y": 0, "max_y": 1, "min_z": 0, "max_z": 1},
          "root_crop": {"min_x": 0, "max_x": 1, "min_y": 0, "max_y": 1, "min_z": 0, "max_z": 1},
          "layers": [],
          "view": {
            "side_plane": "xz",
            "slice_thickness": 1,
            "cursor_x": null,
            "cursor_y": null,
            "color_mode": "height"
          },
          "export": {"kind": "cloud", "target_path": null}
        }
        """,
        encoding="utf-8",
    )
    client = TestClient(app)

    response = client.post("/api/projects/load", json={"path": str(project_path)})

    assert response.status_code == 200
    assert response.json()["view"]["slice_scope"] == "full"
