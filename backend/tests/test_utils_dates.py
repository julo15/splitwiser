"""Unit tests for utils.dates.normalize_date."""

import pytest

from utils.dates import normalize_date


class TestNormalizeDate:
    def test_bare_iso_date_passes_through(self):
        assert normalize_date("2025-12-27") == "2025-12-27"

    @pytest.mark.parametrize("value", [
        "2025-12-27T00:00:00.000Z",
        "2025-12-27T13:45:00Z",
        "2025-12-27T13:45:00+02:00",
        "2025-12-27T00:00:00",
    ])
    def test_iso_datetime_is_truncated_to_the_date(self, value):
        assert normalize_date(value) == "2025-12-27"

    def test_empty_string_passes_through(self):
        assert normalize_date("") == ""

    def test_none_passes_through(self):
        assert normalize_date(None) is None

    @pytest.mark.parametrize("value", ["not-a-date", "12/27/2025", "2025-12"])
    def test_malformed_input_passes_through_unchanged(self, value):
        # Callers that need validation wrap the result in date.fromisoformat.
        assert normalize_date(value) == value

    def test_is_idempotent(self):
        once = normalize_date("2025-12-27T13:45:00Z")
        assert normalize_date(once) == once

    def test_sorts_mixed_formats_consistently(self):
        raw = ["2025-12-27T23:00:00Z", "2025-01-02", "2025-06-15T00:00:00.000Z"]
        assert sorted(normalize_date(d) for d in raw) == [
            "2025-01-02", "2025-06-15", "2025-12-27",
        ]
