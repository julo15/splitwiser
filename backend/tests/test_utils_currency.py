"""Unit tests for utils.currency — formatting, conversion, and rate fetching.

Network calls to the Frankfurter API are mocked; no test here touches the
network. The rate cache is reset around every test so ordering can't leak
state between cases.
"""

import pytest
from unittest.mock import Mock, patch

from utils import currency
from utils.currency import (
    EXCHANGE_RATES,
    CURRENCY_SYMBOLS,
    VALID_CURRENCIES,
    format_currency,
    fetch_historical_exchange_rate,
    get_exchange_rate_for_expense,
    convert_to_usd,
    convert_currency,
    get_current_exchange_rates,
)


@pytest.fixture(autouse=True)
def clear_rate_cache():
    """Reset the module-level rate cache so tests stay independent."""
    currency._exchange_rate_cache["rates"] = None
    currency._exchange_rate_cache["fetched_at"] = None
    yield
    currency._exchange_rate_cache["rates"] = None
    currency._exchange_rate_cache["fetched_at"] = None


def mock_response(payload):
    response = Mock()
    response.json.return_value = payload
    response.raise_for_status.return_value = None
    return response


# --- constants -------------------------------------------------------------

class TestCurrencyConstants:
    def test_valid_currencies_matches_exchange_rate_keys(self):
        assert set(VALID_CURRENCIES) == set(EXCHANGE_RATES.keys())

    def test_every_currency_has_a_symbol(self):
        assert set(EXCHANGE_RATES.keys()) == set(CURRENCY_SYMBOLS.keys())

    def test_usd_is_the_base_currency(self):
        assert EXCHANGE_RATES["USD"] == 1.0


# --- format_currency -------------------------------------------------------

class TestFormatCurrency:
    @pytest.mark.parametrize("cents,code,expected", [
        (1234, "USD", "$12.34"),
        (1234, "EUR", "€12.34"),
        (1234, "GBP", "£12.34"),
        (1234, "CAD", "CA$12.34"),
        (1234, "HKD", "HK$12.34"),
        (1234, "CHF", "CHF12.34"),
    ])
    def test_formats_with_symbol_and_two_decimals(self, cents, code, expected):
        assert format_currency(cents, code) == expected

    def test_zero(self):
        assert format_currency(0, "USD") == "$0.00"

    def test_negative_places_sign_before_symbol(self):
        assert format_currency(-1234, "USD") == "-$12.34"

    def test_sub_dollar_amount_keeps_leading_zero(self):
        assert format_currency(5, "USD") == "$0.05"

    def test_large_amount(self):
        assert format_currency(123456789, "USD") == "$1234567.89"

    def test_jpy_has_no_decimal_places(self):
        assert format_currency(150000, "JPY") == "¥1500"

    def test_jpy_rounds_to_whole_units(self):
        assert format_currency(150050, "JPY") == "¥1500"

    def test_unknown_currency_falls_back_to_its_code(self):
        assert format_currency(1234, "XYZ") == "XYZ12.34"


# --- fetch_historical_exchange_rate ----------------------------------------

class TestFetchHistoricalExchangeRate:
    def test_same_currency_short_circuits_without_a_request(self):
        with patch("utils.currency.requests.get") as mock_get:
            assert fetch_historical_exchange_rate("2025-01-15", "USD", "USD") == 1.0
        mock_get.assert_not_called()

    def test_parses_rate_from_api_response(self):
        with patch("utils.currency.requests.get") as mock_get:
            mock_get.return_value = mock_response({"rates": {"USD": 1.0842}})
            rate = fetch_historical_exchange_rate("2025-01-15", "EUR", "USD")
        assert rate == 1.0842

    def test_requests_the_right_endpoint_and_params(self):
        with patch("utils.currency.requests.get") as mock_get:
            mock_get.return_value = mock_response({"rates": {"USD": 1.08}})
            fetch_historical_exchange_rate("2025-01-15", "EUR", "USD")
        args, kwargs = mock_get.call_args
        assert args[0] == "https://api.frankfurter.app/2025-01-15"
        assert kwargs["params"] == {"from": "EUR", "to": "USD"}

    def test_uses_a_timeout(self):
        # An un-bounded call here would hang expense creation.
        with patch("utils.currency.requests.get") as mock_get:
            mock_get.return_value = mock_response({"rates": {"USD": 1.08}})
            fetch_historical_exchange_rate("2025-01-15", "EUR", "USD")
        assert mock_get.call_args.kwargs["timeout"] == 5

    def test_missing_target_currency_returns_none(self):
        with patch("utils.currency.requests.get") as mock_get:
            mock_get.return_value = mock_response({"rates": {"GBP": 0.79}})
            assert fetch_historical_exchange_rate("2025-01-15", "EUR", "USD") is None

    def test_response_without_rates_key_returns_none(self):
        with patch("utils.currency.requests.get") as mock_get:
            mock_get.return_value = mock_response({"error": "not found"})
            assert fetch_historical_exchange_rate("2025-01-15", "EUR", "USD") is None

    def test_network_error_returns_none(self):
        with patch("utils.currency.requests.get", side_effect=Exception("boom")):
            assert fetch_historical_exchange_rate("2025-01-15", "EUR", "USD") is None

    def test_http_error_returns_none(self):
        response = Mock()
        response.raise_for_status.side_effect = Exception("500 Server Error")
        with patch("utils.currency.requests.get", return_value=response):
            assert fetch_historical_exchange_rate("2025-01-15", "EUR", "USD") is None


# --- get_exchange_rate_for_expense -----------------------------------------

class TestGetExchangeRateForExpense:
    def test_usd_is_always_one_without_a_request(self):
        with patch("utils.currency.requests.get") as mock_get:
            assert get_exchange_rate_for_expense("2025-01-15", "USD") == 1.0
        mock_get.assert_not_called()

    def test_uses_the_live_rate_when_available(self):
        with patch("utils.currency.fetch_historical_exchange_rate", return_value=1.0842):
            assert get_exchange_rate_for_expense("2025-01-15", "EUR") == 1.0842

    def test_falls_back_to_the_static_rate_on_api_failure(self):
        with patch("utils.currency.fetch_historical_exchange_rate", return_value=None):
            assert get_exchange_rate_for_expense("2025-01-15", "EUR") == EXCHANGE_RATES["EUR"]

    def test_unknown_currency_falls_back_to_one(self):
        with patch("utils.currency.fetch_historical_exchange_rate", return_value=None):
            assert get_exchange_rate_for_expense("2025-01-15", "XYZ") == 1.0


# --- conversion ------------------------------------------------------------

class TestConversion:
    def test_usd_to_usd_is_identity(self):
        assert convert_to_usd(100.0, "USD") == 100.0

    def test_converts_using_static_rates(self):
        # EUR rate is 0.92 EUR per USD, so 92 EUR is 100 USD.
        assert convert_to_usd(92.0, "EUR") == pytest.approx(100.0)

    def test_unknown_currency_is_returned_unchanged(self):
        assert convert_to_usd(100.0, "XYZ") == 100.0

    def test_convert_currency_same_currency_is_identity(self):
        assert convert_currency(100.0, "EUR", "EUR") == 100.0

    def test_convert_currency_routes_through_usd(self):
        # 92 EUR -> 100 USD -> 79 GBP
        assert convert_currency(92.0, "EUR", "GBP") == pytest.approx(79.0)

    def test_convert_currency_round_trip_returns_the_original(self):
        there = convert_currency(100.0, "EUR", "GBP")
        assert convert_currency(there, "GBP", "EUR") == pytest.approx(100.0)

    def test_convert_currency_unknown_target_returns_usd_amount(self):
        assert convert_currency(92.0, "EUR", "XYZ") == pytest.approx(100.0)

    def test_convert_currency_unknown_source_treats_amount_as_usd(self):
        assert convert_currency(100.0, "XYZ", "GBP") == pytest.approx(79.0)


# --- get_current_exchange_rates --------------------------------------------

class TestGetCurrentExchangeRates:
    def test_returns_api_rates_with_usd_added(self):
        with patch("utils.currency.requests.get") as mock_get:
            mock_get.return_value = mock_response({"rates": {"EUR": 0.91, "GBP": 0.78}})
            rates = get_current_exchange_rates()
        assert rates == {"USD": 1.0, "EUR": 0.91, "GBP": 0.78}

    def test_second_call_is_served_from_cache(self):
        with patch("utils.currency.requests.get") as mock_get:
            mock_get.return_value = mock_response({"rates": {"EUR": 0.91}})
            first = get_current_exchange_rates()
            second = get_current_exchange_rates()
        assert mock_get.call_count == 1
        assert first == second

    def test_cache_expires_after_the_ttl(self):
        with patch("utils.currency.requests.get") as mock_get:
            mock_get.return_value = mock_response({"rates": {"EUR": 0.91}})
            get_current_exchange_rates()
            # Age the cache entry past the TTL.
            currency._exchange_rate_cache["fetched_at"] -= currency._CACHE_TTL_SECONDS + 1
            get_current_exchange_rates()
        assert mock_get.call_count == 2

    def test_network_error_falls_back_to_static_rates(self):
        with patch("utils.currency.requests.get", side_effect=Exception("boom")):
            assert get_current_exchange_rates() == EXCHANGE_RATES

    def test_invalid_response_falls_back_to_static_rates(self):
        with patch("utils.currency.requests.get") as mock_get:
            mock_get.return_value = mock_response({"unexpected": True})
            assert get_current_exchange_rates() == EXCHANGE_RATES

    def test_a_failed_fetch_is_not_cached(self):
        with patch("utils.currency.requests.get", side_effect=Exception("boom")):
            get_current_exchange_rates()
        assert currency._exchange_rate_cache["rates"] is None
