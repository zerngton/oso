#!/usr/bin/env bash
# Wraps site.html (the page body, as published to Claude Artifacts) into a full index.html for any static host.
set -euo pipefail
cd "$(dirname "$0")/.."
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  sed -n '1,/^<\/style>/p' site.html
  printf '</head>\n<body>\n'
  sed -n '/^<\/style>/,$p' site.html | tail -n +2
  printf '</body>\n</html>\n'
} > index.html
echo "index.html rebuilt"
