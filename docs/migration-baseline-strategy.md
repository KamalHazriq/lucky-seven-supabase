# Migration Baseline Strategy

This repo already has production-shaped migration history, including legacy duplicate prefixes at `00018_*` and `00019_*`. Those duplicates are intentionally frozen instead of being renamed in place, because renumbering applied migrations is risky for any environment that has already executed them.

## Current policy

- Treat `00001` through `00023` as the legacy chain.
- Do not rename, reorder, or squash existing production-applied migrations in place.
- New migrations must use unique numeric prefixes greater than `00023`.
- CI now enforces that no new duplicate prefixes are introduced outside the legacy `00018` and `00019` pairings.

## Baseline plan for fresh environments

When the schema stabilizes enough for a reset-friendly baseline, create a new baseline snapshot migration instead of rewriting history:

1. Materialize a fresh schema snapshot from a production-validated database.
2. Store it as a clearly named baseline migration with a new prefix block, for example `01000_baseline_schema.sql`.
3. Keep the legacy chain in the repo for existing deployments and forensic history.
4. Document the cutover point so new environments can apply the baseline plus post-baseline migrations, while old environments continue from the legacy chain they already have.

## Why this is safer

- Existing environments remain reproducible without drift from renamed files.
- Fresh environments get a shorter, easier-to-audit bootstrap path.
- Duplicate numbering stops growing from this point forward.
- CI can stay strict for all future migrations without breaking the already-deployed chain.
