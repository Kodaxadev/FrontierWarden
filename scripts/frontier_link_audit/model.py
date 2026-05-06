"""Data model for link audit records."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PageRecord:
    url: str
    parent_url: Optional[str]
    depth: int
    status_code: Optional[int]
    content_type: Optional[str]
    title: str
    classification: str
    keywords: list[str] = field(default_factory=list)
    high_priority_keywords: list[str] = field(default_factory=list)
    outbound_links: list[str] = field(default_factory=list)
    redirect_url: Optional[str] = None
    error: Optional[str] = None
