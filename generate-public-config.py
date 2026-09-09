#!/usr/bin/env python3
"""
Reads .env and writes public-config.txt, containing only the two values
that are actually meant to be public (SUPABASE_URL and
SUPABASE_PUBLISHABLE_KEY). js/supabase.js fetches public-config.txt, not
.env directly, so the real .env file is never requested over HTTP by the
app itself.

Run this once after filling in .env, and again any time you change it:

    python3 generate-public-config.py

No dependencies beyond the Python standard library (already required for
serving the site locally — see README.md).
"""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"
OUTPUT_FILE = ROOT / "public-config.txt"
PUBLIC_KEYS = ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY")


def parse_env(text):
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values


def main():
    if not ENV_FILE.exists():
        print(".env not found — copy .env.example to .env and fill in your Supabase project's values first.", file=sys.stderr)
        sys.exit(1)

    values = parse_env(ENV_FILE.read_text())
    missing = [k for k in PUBLIC_KEYS if not values.get(k)]
    if missing:
        print("Missing or empty in .env: " + ", ".join(missing), file=sys.stderr)
        sys.exit(1)

    lines = [f"{key}={values[key]}" for key in PUBLIC_KEYS]
    OUTPUT_FILE.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUTPUT_FILE.name} ({', '.join(PUBLIC_KEYS)}).")


if __name__ == "__main__":
    main()
