import re

_INJECTION_PATTERNS = [
    re.compile(r"ignore (all|any|the)?\s*(previous|prior|above)\s*(instructions?|rules?|prompt)", re.I),
    re.compile(r"disregard (all|any|the)?\s*(previous|prior|above)\s*(instructions?|rules?|prompt)", re.I),
    re.compile(r"reveal (your|the) (system prompt|instructions)", re.I),
    re.compile(r"you are (now|no longer) (a|an)\s", re.I),
    re.compile(r"new instructions\s*:", re.I),
    re.compile(r"</?(system|assistant)>", re.I),
    re.compile(r"\[/?system\]", re.I),
]

_OUTPUT_PATTERNS = [
    re.compile(r"(here('s| is)|the) (full |complete )?system prompt", re.I),
]


def scan_input(text: str) -> str | None:
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(text):
            return "message blocked: contains suspected instruction-override content"
    return None


def scan_output(text: str) -> str | None:
    for pattern in _OUTPUT_PATTERNS:
        if pattern.search(text):
            return "response flagged: appears to disclose internal instructions"
    return None
