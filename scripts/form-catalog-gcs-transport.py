#!/usr/bin/env python3
"""CLI wrapper for scalable immutable form-catalog GCS transport."""

from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.form_catalog_factory.gcs_transport_cli import main


if __name__ == "__main__":
    raise SystemExit(main())
