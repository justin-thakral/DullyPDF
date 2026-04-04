#!/usr/bin/env python3
"""Render a .env-style file into the Cloud Run env-vars YAML format."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if value and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def parse_key_value(raw: str) -> tuple[str, str]:
    if "=" not in raw:
        raise argparse.ArgumentTypeError(f"Expected KEY=VALUE, got: {raw}")
    key, value = raw.split("=", 1)
    key = key.strip()
    if not key:
        raise argparse.ArgumentTypeError(f"Missing key in: {raw}")
    return key, value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert a .env file into a Cloud Run env-vars YAML file.",
    )
    parser.add_argument("input", type=Path, help="Input .env file")
    parser.add_argument("output", type=Path, help="Output YAML path")
    parser.add_argument(
        "--omit",
        action="append",
        default=[],
        metavar="KEY",
        help="Drop a key from the rendered output",
    )
    parser.add_argument(
        "--unset",
        action="append",
        default=[],
        metavar="KEY",
        help="Drop a key from the rendered output after parsing",
    )
    parser.add_argument(
        "--set",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        type=parse_key_value,
        help="Override or add a rendered key/value pair",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    data = parse_env_file(args.input)

    for key in args.omit:
        data.pop(key, None)
    for key in args.unset:
        data.pop(key, None)
    for key, value in args.set:
        data[key] = value

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        for key in sorted(data):
            handle.write(f"{key}: {json.dumps(data[key])}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
