class PointCloudError(ValueError):
    """Raised when a point-cloud file cannot be parsed or written."""


class UnsupportedPointCloudError(PointCloudError):
    """Raised for valid point-cloud formats outside the MVP support envelope."""
