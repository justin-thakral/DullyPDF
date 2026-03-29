"""Monthly signing quota helpers."""

from __future__ import annotations

from backend.services.limits_service import resolve_signing_requests_monthly_limit


def build_signing_monthly_quota_message(limit: int) -> str:
    return f"This account has already reached the {max(0, int(limit))} sent signing request limit for this month."


def build_public_signing_monthly_quota_message() -> str:
    return "This sender has already reached their monthly signing limit. Contact the sender for an offline copy."


class SigningRequestMonthlyLimitError(ValueError):
    """Raised when the account has exhausted its monthly signing-send quota."""

    def __init__(self, *, limit: int, public_message: str | None = None) -> None:
        self.limit = max(0, int(limit))
        self.public_message = public_message or build_public_signing_monthly_quota_message()
        super().__init__(build_signing_monthly_quota_message(self.limit))


def build_signing_monthly_limit_error(*, role: str | None) -> SigningRequestMonthlyLimitError:
    return SigningRequestMonthlyLimitError(limit=resolve_signing_requests_monthly_limit(role))
