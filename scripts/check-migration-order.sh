#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_DIR="$ROOT_DIR/supabase/migrations"

is_legacy_duplicate_prefix() {
  case "$1" in
    00018|00019) return 0 ;;
    *) return 1 ;;
  esac
}

seen_prefixes=""
previous_prefix=""

shopt -s nullglob
migrations=("$MIGRATION_DIR"/*.sql)

if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "No migrations found in $MIGRATION_DIR" >&2
  exit 1
fi

for migration in "${migrations[@]}"; do
  filename="$(basename "$migration")"
  if [[ ! "$filename" =~ ^([0-9]{5})_.+\.sql$ ]]; then
    echo "Invalid migration filename: $filename" >&2
    exit 1
  fi

  prefix="${BASH_REMATCH[1]}"

  if [[ -n "$previous_prefix" && "$prefix" < "$previous_prefix" ]]; then
    echo "Migration prefixes are out of order near $filename" >&2
    exit 1
  fi

  if printf '%s\n' "$seen_prefixes" | grep -qx "$prefix"; then
    if ! is_legacy_duplicate_prefix "$prefix"; then
      echo "Duplicate migration prefix detected: $prefix ($filename)" >&2
      exit 1
    fi
  fi

  seen_prefixes="${seen_prefixes}${prefix}"$'\n'
  previous_prefix="$prefix"
done

echo "Migration order check passed. Legacy duplicate prefixes remain allowed only for 00018 and 00019."
