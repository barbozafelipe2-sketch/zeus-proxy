# Recovery lineage — OH-004.2.7

## Source of truth
OH-004.2.7 was created directly from `OlyHub_OH-004.2.5_FULL_RECOVERY` — the build confirmed by the owner as working.

It does **not** use the failed portable/bootstrap branch as its runtime base.

## Protected areas
- Netlify Identity server verification
- Netlify Database foundation
- Netlify Blobs
- provider/model fallback
- Zeus/Olympus runtime
- ZIP create/analyze pipeline
- Project context injection
- voice capability gating
- execution state enum usage

## Changes allowed in this release
- Project product/UI completion
- New `/api/memories` endpoint over the already-existing `memories` table
- Project memory visibility/control
- Project task/files/overview surfaces
- Project-edit UI
- truthful execution UI copy

## Rollback
Rollback target: OH-004.2.5 FULL RECOVERY.
