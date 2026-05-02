import numpy as np

from app.masking import evaluate_keep_mask
from app.models import Bounds, PolygonLayer


def test_root_crop_and_subtract_polygon_keep_semantics() -> None:
    points = np.array(
        [
            [0.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [5.0, 5.0, 0.0],
            [11.0, 1.0, 0.0],
        ],
        dtype=np.float32,
    )
    root = Bounds(min_x=0, max_x=10, min_y=0, max_y=10, min_z=-1, max_z=1)
    layer = PolygonLayer(
        id="layer-1",
        name="remove center",
        operation="subtract",
        polygon=[(0.5, 0.5), (2.0, 0.5), (2.0, 2.0), (0.5, 2.0)],
        z_min=-1,
        z_max=1,
    )

    assert evaluate_keep_mask(points, root, [layer]).tolist() == [True, False, True, False]


def test_intersect_layer_limits_existing_keep_mask() -> None:
    points = np.array([[0, 0, 0], [2, 2, 0], [5, 5, 0]], dtype=np.float32)
    root = Bounds(min_x=0, max_x=10, min_y=0, max_y=10, min_z=-1, max_z=1)
    layer = PolygonLayer(
        id="layer-1",
        name="only corner",
        operation="intersect",
        polygon=[(-1, -1), (3, -1), (3, 3), (-1, 3)],
        z_min=-1,
        z_max=1,
    )

    assert evaluate_keep_mask(points, root, [layer]).tolist() == [True, True, False]
