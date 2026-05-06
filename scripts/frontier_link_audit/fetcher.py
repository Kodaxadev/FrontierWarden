"""HTTP fetch helper."""
from __future__ import annotations

from typing import Optional

import requests

from .config import MAX_BODY_BYTES, USER_AGENT


def fetch(url: str) -> tuple[Optional[int], Optional[str], str, Optional[str], Optional[str]]:
    try:
        resp = requests.get(
            url,
            timeout=20,
            headers={"User-Agent": USER_AGENT},
            allow_redirects=True,
        )
        redirect_url = resp.url if resp.history else None
        content_type = resp.headers.get("Content-Type", "")
        return resp.status_code, content_type, resp.text[:MAX_BODY_BYTES], redirect_url, None
    except requests.RequestException as exc:
        return None, None, "", None, str(exc)
