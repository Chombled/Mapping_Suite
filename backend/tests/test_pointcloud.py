from pathlib import Path

import numpy as np

from app.pointcloud import read_point_cloud, write_point_cloud


def write_ascii_pcd(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "# test",
                "VERSION 0.7",
                "FIELDS x y z intensity",
                "SIZE 4 4 4 4",
                "TYPE F F F F",
                "COUNT 1 1 1 1",
                "WIDTH 3",
                "HEIGHT 1",
                "VIEWPOINT 0 0 0 1 0 0 0",
                "POINTS 3",
                "DATA ascii",
                "0 0 0 10",
                "1 1 1 20",
                "2 2 2 30",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def write_ascii_ply(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "ply",
                "format ascii 1.0",
                "element vertex 2",
                "property float x",
                "property float y",
                "property float z",
                "property float intensity",
                "end_header",
                "0 0 0 4",
                "1 2 3 8",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def test_reads_ascii_pcd_with_intensity(tmp_path: Path) -> None:
    source = tmp_path / "map.pcd"
    write_ascii_pcd(source)

    cloud = read_point_cloud(source)

    assert cloud.points.shape == (3, 3)
    assert cloud.intensity is not None
    assert cloud.intensity.tolist() == [10, 20, 30]
    assert cloud.bounds.max_z == 2


def test_reads_ascii_ply_with_intensity(tmp_path: Path) -> None:
    source = tmp_path / "map.ply"
    write_ascii_ply(source)

    cloud = read_point_cloud(source)

    assert cloud.points.tolist() == [[0, 0, 0], [1, 2, 3]]
    assert cloud.intensity is not None
    assert cloud.intensity.tolist() == [4, 8]


def test_writes_pruned_same_extension(tmp_path: Path) -> None:
    source = tmp_path / "map.pcd"
    target = tmp_path / "pruned.pcd"
    write_ascii_pcd(source)
    cloud = read_point_cloud(source)

    write_point_cloud(target, cloud, np.array([True, False, True]))

    exported = read_point_cloud(target)
    assert exported.points.tolist() == [[0, 0, 0], [2, 2, 2]]
    assert exported.intensity is not None
    assert exported.intensity.tolist() == [10, 30]
