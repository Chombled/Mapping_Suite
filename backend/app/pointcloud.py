from __future__ import annotations

from dataclasses import dataclass
from io import StringIO
from pathlib import Path
from typing import BinaryIO

import numpy as np

from app.errors import PointCloudError, UnsupportedPointCloudError
from app.models import Bounds, PointCloudMetadata


@dataclass(slots=True)
class PointCloudData:
    points: np.ndarray
    fields: list[str]
    source_format: str
    intensity: np.ndarray | None = None
    rgb: np.ndarray | None = None

    @property
    def bounds(self) -> Bounds:
        mins = self.points.min(axis=0)
        maxs = self.points.max(axis=0)
        return Bounds(
            min_x=float(mins[0]),
            max_x=float(maxs[0]),
            min_y=float(mins[1]),
            max_y=float(maxs[1]),
            min_z=float(mins[2]),
            max_z=float(maxs[2]),
        )

    def metadata(self, source_path: str) -> PointCloudMetadata:
        return PointCloudMetadata(
            source_path=source_path,
            source_format=self.source_format,  # type: ignore[arg-type]
            point_count=int(self.points.shape[0]),
            fields=self.fields,
            has_intensity=self.intensity is not None,
            has_rgb=self.rgb is not None,
            bounds=self.bounds,
        )


def read_point_cloud(path: str | Path) -> PointCloudData:
    source = Path(path)
    suffix = source.suffix.lower()
    if suffix == ".pcd":
        return read_pcd(source)
    if suffix == ".ply":
        return read_ply(source)
    raise UnsupportedPointCloudError(f"Unsupported point-cloud extension: {suffix}")


def write_point_cloud(path: str | Path, cloud: PointCloudData, mask: np.ndarray) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    suffix = target.suffix.lower()
    if suffix == ".pcd":
        write_pcd_ascii(target, cloud, mask)
        return
    if suffix == ".ply":
        write_ply_ascii(target, cloud, mask)
        return
    raise UnsupportedPointCloudError(f"Unsupported export extension: {suffix}")


def _require_xyz(fields: list[str]) -> tuple[int, int, int]:
    try:
        return fields.index("x"), fields.index("y"), fields.index("z")
    except ValueError as exc:
        raise UnsupportedPointCloudError("Point cloud must contain x, y, and z fields") from exc


def read_pcd(path: Path) -> PointCloudData:
    with path.open("rb") as handle:
        header_lines, data_offset = _read_pcd_header(handle)
        header = _parse_pcd_header(header_lines)
        fields = header.get("fields", [])
        x_idx, y_idx, z_idx = _require_xyz(fields)
        data_kind = header.get("data", [""])[0].lower()

        if data_kind == "ascii":
            handle.seek(data_offset)
            raw_text = handle.read().decode("utf-8", errors="replace")
            values = np.loadtxt(StringIO(raw_text), dtype=np.float32)
            if values.ndim == 1:
                values = values.reshape(1, -1)
            return _cloud_from_columns(values, fields, (x_idx, y_idx, z_idx), "pcd")

        if data_kind == "binary":
            dtype = _pcd_dtype(header)
            count = int(header.get("points", header.get("width", ["0"]))[0])
            handle.seek(data_offset)
            records = np.frombuffer(handle.read(), dtype=dtype, count=count)
            return _cloud_from_structured(records, fields, "pcd")

    raise UnsupportedPointCloudError(f"Unsupported PCD DATA value: {data_kind}")


def _read_pcd_header(handle: BinaryIO) -> tuple[list[str], int]:
    lines: list[str] = []
    while True:
        line = handle.readline()
        if not line:
            raise PointCloudError("PCD header ended before DATA line")
        decoded = line.decode("utf-8", errors="replace").strip()
        lines.append(decoded)
        if decoded.lower().startswith("data "):
            return lines, handle.tell()


def _parse_pcd_header(lines: list[str]) -> dict[str, list[str]]:
    header: dict[str, list[str]] = {}
    for line in lines:
        if not line or line.startswith("#"):
            continue
        key, *values = line.split()
        header[key.lower()] = [value.lower() for value in values]
    return header


def _pcd_dtype(header: dict[str, list[str]]) -> np.dtype:
    fields = header["fields"]
    sizes = [int(value) for value in header["size"]]
    types = header["type"]
    counts = [int(value) for value in header.get("count", ["1"] * len(fields))]
    dtype_fields: list[tuple[str, str] | tuple[str, str, tuple[int, ...]]] = []

    for field, size, kind, count in zip(fields, sizes, types, counts, strict=True):
        numpy_type = _pcd_numpy_type(size, kind)
        if count == 1:
            dtype_fields.append((field, numpy_type))
        else:
            dtype_fields.append((field, numpy_type, (count,)))
    return np.dtype(dtype_fields)


def _pcd_numpy_type(size: int, kind: str) -> str:
    if kind == "f" and size == 4:
        return "<f4"
    if kind == "f" and size == 8:
        return "<f8"
    if kind == "i" and size in {1, 2, 4, 8}:
        return f"<i{size}"
    if kind == "u" and size in {1, 2, 4, 8}:
        return f"<u{size}"
    raise UnsupportedPointCloudError(f"Unsupported PCD field type: {kind}{size}")


def _cloud_from_columns(
    values: np.ndarray,
    fields: list[str],
    xyz_indices: tuple[int, int, int],
    source_format: str,
) -> PointCloudData:
    points = values[:, list(xyz_indices)].astype(np.float32, copy=False)
    intensity = (
        values[:, fields.index("intensity")].astype(np.float32) if "intensity" in fields else None
    )
    rgb = _unpack_rgb(values[:, fields.index("rgb")]) if "rgb" in fields else None
    return PointCloudData(
        points=points, intensity=intensity, rgb=rgb, fields=fields, source_format=source_format
    )


def _cloud_from_structured(
    records: np.ndarray, fields: list[str], source_format: str
) -> PointCloudData:
    _require_xyz(fields)
    points = np.column_stack([records["x"], records["y"], records["z"]]).astype(np.float32)
    intensity = (
        records["intensity"].astype(np.float32) if "intensity" in records.dtype.names else None
    )
    rgb = _unpack_rgb(records["rgb"]) if "rgb" in records.dtype.names else None
    return PointCloudData(
        points=points, intensity=intensity, rgb=rgb, fields=fields, source_format=source_format
    )


def _unpack_rgb(values: np.ndarray) -> np.ndarray:
    packed = (
        values.astype(np.float32).view(np.uint32)
        if np.issubdtype(values.dtype, np.floating)
        else values.astype(np.uint32)
    )
    red = ((packed >> 16) & 255).astype(np.uint8)
    green = ((packed >> 8) & 255).astype(np.uint8)
    blue = (packed & 255).astype(np.uint8)
    return np.column_stack([red, green, blue])


def read_ply(path: Path) -> PointCloudData:
    with path.open("rb") as handle:
        header_lines, data_offset = _read_ply_header(handle)
        format_name, vertex_count, properties = _parse_ply_header(header_lines)
        fields = [name for name, _ in properties]
        x_idx, y_idx, z_idx = _require_xyz(fields)

        if format_name == "ascii":
            handle.seek(data_offset)
            raw_text = handle.read().decode("utf-8", errors="replace")
            values = np.loadtxt(StringIO(raw_text), dtype=np.float32, max_rows=vertex_count)
            if values.ndim == 1:
                values = values.reshape(1, -1)
            return _cloud_from_columns(values, fields, (x_idx, y_idx, z_idx), "ply")

        if format_name == "binary_little_endian":
            dtype = np.dtype([(name, _ply_numpy_type(kind)) for name, kind in properties])
            handle.seek(data_offset)
            records = np.frombuffer(
                handle.read(dtype.itemsize * vertex_count), dtype=dtype, count=vertex_count
            )
            return _cloud_from_structured(records, fields, "ply")

    raise UnsupportedPointCloudError(f"Unsupported PLY format: {format_name}")


def _read_ply_header(handle: BinaryIO) -> tuple[list[str], int]:
    lines: list[str] = []
    first = handle.readline().decode("utf-8", errors="replace").strip()
    if first != "ply":
        raise PointCloudError("PLY file must start with 'ply'")
    lines.append(first)

    while True:
        line = handle.readline()
        if not line:
            raise PointCloudError("PLY header ended before end_header")
        decoded = line.decode("utf-8", errors="replace").strip()
        lines.append(decoded)
        if decoded == "end_header":
            return lines, handle.tell()


def _parse_ply_header(lines: list[str]) -> tuple[str, int, list[tuple[str, str]]]:
    format_name = ""
    vertex_count = 0
    in_vertex = False
    properties: list[tuple[str, str]] = []

    for line in lines:
        parts = line.split()
        if not parts or parts[0] == "comment":
            continue
        if parts[0] == "format":
            format_name = parts[1]
        elif parts[:2] == ["element", "vertex"]:
            vertex_count = int(parts[2])
            in_vertex = True
        elif parts[0] == "element":
            in_vertex = False
        elif parts[0] == "property" and in_vertex:
            if parts[1] == "list":
                raise UnsupportedPointCloudError(
                    "PLY list properties are not supported for vertices"
                )
            properties.append((parts[2], parts[1]))

    if not format_name or vertex_count <= 0:
        raise PointCloudError("PLY header missing format or vertex count")
    return format_name, vertex_count, properties


def _ply_numpy_type(kind: str) -> str:
    mapping = {
        "char": "<i1",
        "uchar": "<u1",
        "int8": "<i1",
        "uint8": "<u1",
        "short": "<i2",
        "ushort": "<u2",
        "int16": "<i2",
        "uint16": "<u2",
        "int": "<i4",
        "uint": "<u4",
        "int32": "<i4",
        "uint32": "<u4",
        "float": "<f4",
        "float32": "<f4",
        "double": "<f8",
        "float64": "<f8",
    }
    try:
        return mapping[kind]
    except KeyError as exc:
        raise UnsupportedPointCloudError(f"Unsupported PLY property type: {kind}") from exc


def write_pcd_ascii(path: Path, cloud: PointCloudData, mask: np.ndarray) -> None:
    points = cloud.points[mask]
    intensity = cloud.intensity[mask] if cloud.intensity is not None else None
    fields = ["x", "y", "z"] + (["intensity"] if intensity is not None else [])
    with path.open("w", encoding="utf-8") as handle:
        handle.write("# .PCD v0.7 - Point Cloud Data file generated by Mapping Suite\n")
        handle.write("VERSION 0.7\n")
        handle.write(f"FIELDS {' '.join(fields)}\n")
        handle.write(f"SIZE {' '.join(['4'] * len(fields))}\n")
        handle.write(f"TYPE {' '.join(['F'] * len(fields))}\n")
        handle.write(f"COUNT {' '.join(['1'] * len(fields))}\n")
        handle.write(f"WIDTH {points.shape[0]}\n")
        handle.write("HEIGHT 1\n")
        handle.write("VIEWPOINT 0 0 0 1 0 0 0\n")
        handle.write(f"POINTS {points.shape[0]}\n")
        handle.write("DATA ascii\n")
        for idx, point in enumerate(points):
            values = [*point.tolist()]
            if intensity is not None:
                values.append(float(intensity[idx]))
            handle.write(" ".join(f"{value:.8g}" for value in values) + "\n")


def write_ply_ascii(path: Path, cloud: PointCloudData, mask: np.ndarray) -> None:
    points = cloud.points[mask]
    intensity = cloud.intensity[mask] if cloud.intensity is not None else None
    with path.open("w", encoding="utf-8") as handle:
        handle.write("ply\n")
        handle.write("format ascii 1.0\n")
        handle.write(f"element vertex {points.shape[0]}\n")
        handle.write("property float x\nproperty float y\nproperty float z\n")
        if intensity is not None:
            handle.write("property float intensity\n")
        handle.write("end_header\n")
        for idx, point in enumerate(points):
            values = [*point.tolist()]
            if intensity is not None:
                values.append(float(intensity[idx]))
            handle.write(" ".join(f"{value:.8g}" for value in values) + "\n")
