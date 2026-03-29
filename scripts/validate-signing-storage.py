#!/usr/bin/env python3
"""Validate signing storage policy expectations for deploy/runtime checks."""

from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.services.signing_storage_service import describe_signing_storage_policy


def main() -> int:
    try:
        payload = describe_signing_storage_policy()
    except Exception as exc:
        print(f"Signing storage validation failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
