# OlyHub canonical Realm blueprint

**Authority:** [`public/realm-blueprint.json`](../public/realm-blueprint.json) is the single machine-readable source for Realm order, identity, role, descriptions, model policy, skills, and readiness state. The UI reads that file directly. Backend workflow and skill metadata read the same file through `netlify/functions/_shared/realm-blueprint.mjs`.

This document explains how to interpret that contract; it is not a second editable catalog. Change the JSON first, then update runtime wiring only when a capability is approved and implemented.

## Canonical architecture

- Zeus is a separate director/auditor surface and appears first. Its shell is not an audit pipeline. DeepSeek remains a candidate for evaluation, with no version or execution route approved.
- Poseidon is the OlyHub Core coordinator and appears second. Text routing is task-aware: a native provider via Netlify AI Gateway first, OpenRouter via that Gateway next, then optional direct Google/OpenAI fallback through explicit `*_DIRECT_API_KEY` credentials. Anthropic/OpenRouter personal keys are not required and are never called directly. Live Talk defaults to OpenAI Realtime; ElevenLabs Realtime is optional. The selected orb controls the visible deity identity; the Live Talk screen itself does not pin a deity name.
- Zeus is a separate oversight surface. The nine Realm entries are Poseidon, Athena, Hefesto, Apollo, Dionísio, Peitho, Deméter, Hermes, and Hades. Héstia (source review) and Mnemosine (memory retrieval) are internal capabilities, not dedicated Realm cards.
- “Active” means a backend workflow or supported integration exists. It does not mean every blueprint skill is active. “Planned” and “internal” remain explicit in the interface. Hermes is partial: Google Gmail, Calendar, and Drive are read-only; its dedicated communication executor is not connected.
- The currently connected specialist workflows are Athena research and documents, Hefesto code, Apollo images, and Héstia internal source review. The skill registry must not enable planned Realm skills until a matching guarded workflow is implemented.
- Zeus/Olympus levels and selectors are not product UI. Old identifiers may remain only where stored data, APIs, tests, or migration compatibility requires them.

## Model display policy

Model policy and runtime availability are separate facts. The blueprint describes chosen defaults or candidates; the live model list comes from `/api/tool-models`. A candidate is never labeled as connected merely because it is listed in the blueprint. Exact model pools, provider credentials, fallbacks, and callability continue to be enforced by the backend.

## Updating the contract

1. Edit `public/realm-blueprint.json` and keep its status accurate.
2. If the change enables a skill, add or update its guarded executor and permissions in the backend in the same change.
3. Add/update regression checks that compare backend owners, active workflows, and UI model/skill state with this contract.
4. Run the release checks before committing.

Historical recovery notes and compatibility identifiers are retained as history; they do not override this contract.
