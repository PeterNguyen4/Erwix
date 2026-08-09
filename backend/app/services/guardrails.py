import re

_INJECTION_PATTERNS = [
    re.compile(
        r"ignore (all|any|the)?\s*(previous|prior|above)\s*(instructions?|rules?|prompt)",
        re.IGNORECASE,
    ),
    re.compile(
        r"disregard (all|any|the)?\s*(previous|prior|above)\s*(instructions?|rules?|prompt)",
        re.IGNORECASE,
    ),
    re.compile(r"reveal (your|the) (system prompt|instructions)", re.IGNORECASE),
    re.compile(r"you are (now|no longer) (a|an)\s", re.IGNORECASE),
    re.compile(r"new instructions\s*:", re.IGNORECASE),
    re.compile(r"</?(system|assistant)>", re.IGNORECASE),
    re.compile(r"\[/?system\]", re.IGNORECASE),
]

_OUTPUT_PATTERNS = [
    re.compile(r"(here('s| is)|the) (full |complete )?system prompt", re.IGNORECASE),
]

_SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_PATTERN = re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
_CARD_CANDIDATE_PATTERN = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")


def _luhn_valid(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def _contains_credit_card(text: str) -> bool:
    for match in _CARD_CANDIDATE_PATTERN.finditer(text):
        digits = re.sub(r"[ -]", "", match.group())
        if 13 <= len(digits) <= 19 and _luhn_valid(digits):
            return True
    return False


def scan_input(text: str) -> str | None:
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(text):
            return "message blocked: contains suspected instruction-override content"
    if (
        _SSN_PATTERN.search(text)
        or _EMAIL_PATTERN.search(text)
        or _PHONE_PATTERN.search(text)
        or _contains_credit_card(text)
    ):
        return "message blocked: appears to contain personal identifying information (SSN, card number, email, or phone)"
    return None


def scan_output(text: str) -> str | None:
    for pattern in _OUTPUT_PATTERNS:
        if pattern.search(text):
            return "response flagged: appears to disclose internal instructions"
    return None
