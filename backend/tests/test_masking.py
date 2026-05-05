import numpy as np

from app.masking import evaluate_keep_mask
from app.models import Bounds, PolygonLayer

POINTS = np.array(
    [
        [1.0, 1.0, 0.0],
        [3.0, 1.0, 0.0],
        [5.0, 1.0, 0.0],
        [9.0, 9.0, 0.0],
        [11.0, 1.0, 0.0],
    ],
    dtype=np.float32,
)
ROOT = Bounds(min_x=0, max_x=10, min_y=0, max_y=10, min_z=-1, max_z=1)
LEFT_POLYGON = [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)]
RIGHT_POLYGON = [(2.0, 0.0), (6.0, 0.0), (6.0, 4.0), (2.0, 4.0)]


def layer(operation: str, polygon: list[tuple[float, float]]) -> PolygonLayer:
    return PolygonLayer(
        id=f"{operation}-{len(polygon)}",
        name=operation,
        operation=operation,
        polygon=polygon,
        z_min=-1,
        z_max=1,
    )


def test_no_enabled_polygon_layers_keep_root_crop() -> None:
    assert evaluate_keep_mask(POINTS, ROOT, []).tolist() == [
        True,
        True,
        True,
        True,
        False,
    ]

    disabled_layer = layer("union", LEFT_POLYGON)
    disabled_layer.enabled = False
    assert evaluate_keep_mask(POINTS, ROOT, [disabled_layer]).tolist() == [
        True,
        True,
        True,
        True,
        False,
    ]


def test_union_layers_keep_points_inside_any_polygon() -> None:
    assert evaluate_keep_mask(
        POINTS,
        ROOT,
        [layer("union", LEFT_POLYGON), layer("union", RIGHT_POLYGON)],
    ).tolist() == [True, True, True, False, False]


def test_difference_layer_subtracts_from_polygon_selection() -> None:
    assert evaluate_keep_mask(
        POINTS,
        ROOT,
        [layer("union", LEFT_POLYGON), layer("difference", RIGHT_POLYGON)],
    ).tolist() == [True, False, False, False, False]


def test_intersection_layer_restricts_polygon_selection() -> None:
    assert evaluate_keep_mask(
        POINTS,
        ROOT,
        [layer("union", LEFT_POLYGON), layer("intersection", RIGHT_POLYGON)],
    ).tolist() == [False, True, False, False, False]


def test_first_difference_or_intersection_keeps_no_points() -> None:
    assert evaluate_keep_mask(POINTS, ROOT, [layer("difference", LEFT_POLYGON)]).tolist() == [
        False,
        False,
        False,
        False,
        False,
    ]
    assert evaluate_keep_mask(POINTS, ROOT, [layer("intersection", LEFT_POLYGON)]).tolist() == [
        False,
        False,
        False,
        False,
        False,
    ]


def test_layer_z_range_participates_in_set_operation() -> None:
    points = np.array([[1.0, 1.0, 0.0], [1.0, 1.0, 2.0]], dtype=np.float32)
    root = Bounds(min_x=0, max_x=10, min_y=0, max_y=10, min_z=-5, max_z=5)
    assert evaluate_keep_mask(points, root, [layer("union", LEFT_POLYGON)]).tolist() == [
        True,
        False,
    ]


def test_legacy_operation_names_normalize_to_set_operations() -> None:
    assert layer("add", LEFT_POLYGON).operation == "union"
    assert layer("subtract", LEFT_POLYGON).operation == "difference"
    assert layer("intersect", LEFT_POLYGON).operation == "intersection"


def test_legacy_difference_name_uses_new_set_semantics() -> None:
    points = np.array(
        [
            [1.0, 1.0, 0.0],
            [3.0, 1.0, 0.0],
        ],
        dtype=np.float32,
    )
    assert evaluate_keep_mask(
        points,
        ROOT,
        [layer("add", LEFT_POLYGON), layer("subtract", RIGHT_POLYGON)],
    ).tolist() == [True, False]
