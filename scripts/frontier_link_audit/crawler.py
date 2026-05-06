"""Breadth-first crawler for FrontierWarden upstream link audits."""
from __future__ import annotations

import time
from collections import deque
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from .config import MAX_PAGES, MAX_PAGES_PER_NETLOC, SEEDS
from .content import extract_title_and_links, find_keywords
from .fetcher import fetch
from .model import PageRecord
from .urls import classify, is_allowed, normalize_url


def _error_record(
    url: str,
    parent: Optional[str],
    depth: int,
    status: Optional[int],
    content_type: Optional[str],
    error: str,
) -> PageRecord:
    return PageRecord(
        url=url,
        parent_url=parent,
        depth=depth,
        status_code=status,
        content_type=content_type,
        title="",
        classification=classify(url),
        error=error,
    )


def crawl(max_depth: int = 3, delay_s: float = 0.4) -> list[PageRecord]:
    seen: set[str] = set()
    netloc_counts: dict[str, int] = {}
    queue: deque[tuple[str, Optional[str], int]] = deque()
    for seed in SEEDS:
        queue.append((normalize_url(seed), None, 0))

    records: list[PageRecord] = []
    total = 0
    print(f"\n{'=' * 60}")
    print("  FrontierWarden Link Audit Crawler")
    print(f"  Max depth: {max_depth}  |  Delay: {delay_s}s")
    print(f"  Seeds: {len(SEEDS)}  |  Started: {datetime.now(timezone.utc).isoformat()}")
    print(f"{'=' * 60}\n")

    while queue:
        url, parent, depth = queue.popleft()
        if url in seen or depth > max_depth or not is_allowed(url):
            continue
        if total >= MAX_PAGES:
            print(f"  [!] Hit MAX_PAGES limit ({MAX_PAGES}). Stopping.", flush=True)
            break

        netloc = urlparse(url).netloc
        domain_count = netloc_counts.get(netloc, 0)
        if domain_count >= MAX_PAGES_PER_NETLOC:
            continue
        netloc_counts[netloc] = domain_count + 1

        seen.add(url)
        total += 1
        status, content_type, text, redirect_url, error = fetch(url)
        if error:
            print(f"  [{total:>4}] ERR  d={depth} {url[:80]}  ({error[:60]})", flush=True)
            records.append(_error_record(url, parent, depth, status, content_type, error))
            time.sleep(delay_s)
            continue

        title, outbound = extract_title_and_links(url, text, content_type)
        kw_all, kw_high = find_keywords(text)
        status_indicator = "OK " if status and 200 <= status < 400 else "!!!"
        kw_tag = f"  KW={len(kw_all)}" if kw_all else ""
        print(f"  [{total:>4}] {status_indicator} {status or '???'} d={depth} {url[:80]}{kw_tag}", flush=True)

        records.append(PageRecord(
            url=url,
            parent_url=parent,
            depth=depth,
            status_code=status,
            content_type=content_type,
            title=title,
            classification=classify(url),
            keywords=kw_all,
            high_priority_keywords=kw_high,
            outbound_links=outbound,
            redirect_url=redirect_url,
            error=error,
        ))

        if status and 200 <= status < 400:
            for link in outbound:
                if link not in seen:
                    queue.append((link, url, depth + 1))
        time.sleep(delay_s)

    print(f"\n  Done. Scanned {total} pages.\n")
    return records
