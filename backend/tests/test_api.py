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
            "name": "remove first",
            "operation": "subtract",
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
    assert preview_response.json()["chunks"]["0"] == [False, True, True]

    target = tmp_path / "mask.npy"
    export_response = client.post(
        "/api/export",
        json={"project": project, "kind": "mask", "target_path": str(target)},
    )
    assert export_response.status_code == 200
    assert export_response.json()["kept_count"] == 2
    assert np.load(target).tolist() == [False, True, True]


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
