"""URL filtering and classification helpers."""
from __future__ import annotations

from urllib.parse import urldefrag, urlparse

from .config import (
    ALLOWED_GITHUB_PREFIXES,
    ALLOWED_NETLOCS,
    CLASSIFICATION_RULES,
    GITHUB_NOISY_SECTIONS,
)


def normalize_url(url: str) -> str:
    clean, _frag = urldefrag(url)
    return clean.rstrip("/")


def is_noisy_github_url(url: str) -> bool:
    parsed = urlparse(url)
    parts = [p.lower() for p in parsed.path.split("/") if p]
    query = parsed.query.lower()

    if len(parts) < 3:
        return False

    if any(part in GITHUB_NOISY_SECTIONS for part in parts[2:]):
        return True

    return bool(query and any(k in query for k in ("q=", "type=", "page=", "is_search=")))


def is_allowed(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    if parsed.netloc not in ALLOWED_NETLOCS:
        return False
    if parsed.netloc in {"github.com", "raw.githubusercontent.com"}:
        return url.startswith(ALLOWED_GITHUB_PREFIXES) and not is_noisy_github_url(url)
    return True


def classify(url: str) -> str:
    for pattern, label in CLASSIFICATION_RULES:
        if pattern in url:
            return label
    return "unknown"
