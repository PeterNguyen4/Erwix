import asyncio
import logging

import resend

from ..config import get_settings

logger = logging.getLogger("erwix.email")
settings = get_settings()


def _send_sync(to: str, subject: str, html: str) -> None:
    resend.api_key = settings.resend_api_key
    resend.Emails.send(
        {
            "from": settings.resend_from_email,
            "to": [to],
            "subject": subject,
            "html": html,
        }
    )


async def send_password_reset_email(to: str, reset_url: str) -> None:
    if not settings.has_resend_creds:
        logger.warning("Resend not configured; skipping password reset email to %s", to)
        return
    html = (
        f"<p>We received a request to reset your Erwix password.</p>"
        f'<p><a href="{reset_url}">Click here to reset your password</a>. '
        f"This link expires in {settings.password_reset_token_expire_minutes} minutes.</p>"
        f"<p>If you didn't request this, you can safely ignore this email.</p>"
    )
    try:
        await asyncio.to_thread(_send_sync, to, "Reset your Erwix password", html)
    except Exception:
        logger.exception("Failed to send password reset email to %s", to)
