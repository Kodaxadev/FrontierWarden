"""Content parsing and keyword extraction."""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .config import HIGH_PRIORITY_KEYWORDS, KEYWORDS
from .urls import is_allowed, normalize_url


def extract_title_and_links(
    url: str, text: str, content_type: Optional[str]
) -> tuple[str, list[str]]:
    links: list[str] = []
    title = ""
    is_html = content_type and "html" in content_type.lower()

    if is_html:
        soup = BeautifulSoup(text, "html.parser")
        if soup.title and soup.title.text:
            title = soup.title.text.strip()
        for tag in soup.find_all("a", href=True):
            href = normalize_url(urljoin(url, tag["href"]))
            if is_allowed(href):
                links.append(href)
    else:
        lines = text.splitlines()
        title = lines[0].strip("# ").strip() if lines else ""
        for match in re.findall(r'https?://[^\s\]\)\"\'<>]+', text):
            href = normalize_url(match)
            if is_allowed(href):
                links.append(href)

    return title[:200], sorted(set(links))


def find_keywords(text: str) -> tuple[list[str], list[str]]:
    lowered = text.lower()
    found: list[str] = []
    high: list[str] = []
    for kw in KEYWORDS:
        if kw.lower() in lowered:
            found.append(kw)
            if kw in HIGH_PRIORITY_KEYWORDS:
                high.append(kw)
    return found, high
