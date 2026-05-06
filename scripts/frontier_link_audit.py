#!/usr/bin/env python3
"""CLI entrypoint for the FrontierWarden upstream link audit."""
from __future__ import annotations

import os
import sys

from frontier_link_audit.crawler import crawl
from frontier_link_audit.config import OUT_DIR
from frontier_link_audit.writers import write_outputs


os.environ["PYTHONUNBUFFERED"] = "1"
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(line_buffering=True)


def main() -> int:
    max_depth = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    delay_s = float(sys.argv[2]) if len(sys.argv) > 2 else 0.4

    records = crawl(max_depth=max_depth, delay_s=delay_s)
    write_outputs(records)

    broken = [r for r in records if r.status_code is None or r.status_code >= 400]
    kw_pages = [r for r in records if r.keywords]
    hi_pages = [r for r in records if r.high_priority_keywords]

    print(f"\n{'=' * 60}")
    print("  SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Total pages scanned:       {len(records)}")
    print(f"  Pages with keywords:       {len(kw_pages)}")
    print(f"  High-priority pages:       {len(hi_pages)}")
    print(f"  Broken/error links:        {len(broken)}")
    print(f"  Outputs:                   {OUT_DIR.resolve()}")
    print(f"{'=' * 60}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
