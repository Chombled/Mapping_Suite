from __future__ import annotations

import numpy as np

from app.models import Bounds, PolygonLayer


def bounds_mask(points: np.ndarray, bounds: Bounds) -> np.ndarray:
    return (
        (points[:, 0] >= bounds.min_x)
        & (points[:, 0] <= bounds.max_x)
        & (points[:, 1] >= bounds.min_y)
        & (points[:, 1] <= bounds.max_y)
        & (points[:, 2] >= bounds.min_z)
        & (points[:, 2] <= bounds.max_z)
    )


def polygon_mask_xy(points: np.ndarray, polygon: list[tuple[float, float]]) -> np.ndarray:
    if len(polygon) < 3:
        return np.zeros(points.shape[0], dtype=bool)

    x = points[:, 0]
    y = points[:, 1]
    inside = np.zeros(points.shape[0], dtype=bool)
    vertices = np.asarray(polygon, dtype=np.float64)
    xj, yj = vertices[-1]

    for xi, yi in vertices:
        crosses = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / ((yj - yi) + 1e-12) + xi)
        inside ^= crosses
        xj, yj = xi, yi

    return inside


def layer_mask(points: np.ndarray, layer: PolygonLayer) -> np.ndarray:
    if not layer.enabled:
        return np.zeros(points.shape[0], dtype=bool)
    z_mask = (points[:, 2] >= layer.z_min) & (points[:, 2] <= layer.z_max)
    return z_mask & polygon_mask_xy(points, layer.polygon)


def evaluate_keep_mask(
    points: np.ndarray, root_crop: Bounds, layers: list[PolygonLayer]
) -> np.ndarray:
    root = bounds_mask(points, root_crop)
    keep = root.copy()

    for layer in layers:
        if not layer.enabled:
            continue
        current = layer_mask(points, layer) & root
        if layer.operation == "add":
            keep |= current
        elif layer.operation == "subtract":
            keep &= ~current
        elif layer.operation == "intersect":
            keep &= current
        else:
            raise ValueError(f"Unsupported layer operation: {layer.operation}")

    return keep
