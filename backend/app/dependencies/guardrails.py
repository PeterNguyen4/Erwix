import logging

from fastapi import HTTPException

from app.services.guardrails import scan_input, scan_output

logger = logging.getLogger("erwix.guardrails")


def guardrail_input_or_raise(text: str) -> None:
    violation = scan_input(text)
    if violation:
        logger.warning("input guardrail triggered: %s", violation)
        raise HTTPException(status_code=400, detail=violation)


async def check_ws_guardrail_input(text: str) -> str | None:
    violation = scan_input(text)
    if violation:
        logger.warning("input guardrail triggered: %s", violation)
        return violation
    return None


def log_output_violation(text: str, *, context: str) -> None:
    violation = scan_output(text)
    if violation:
        logger.warning("output guardrail triggered in %s: %s", context, violation)
