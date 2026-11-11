# OlyHub — Specialist Call Budget (Etapa 3/7)

Status: source implementation prepared; live provider/Netlify validation is a separate gate.
Scope: **only** the specialist workflow called from chat, optional Apollo preflight and handoff.
Poseidon chat gears, explicit Compare A/B, Olympus complex runs and Code Agent approval remain unchanged.

## Default path
1. The deterministic router selects a specialist workflow from the owner's current message.
2. The executor requests one model as CREATOR and returns its complete answer.
3. One additional model attempt may run **only on failure**. A successful first
   model produces one LLM call, not four.
4. If the owner explicitly requests an independent audit/review, run two
   independent family stages: CREATOR and DIRECTOR.
5. If the owner explicitly requests three models, run CREATOR, DIRECTOR, CEO
   across distinct families.
6. Poseidon synthesis is optional and runs only on an explicit request to
   synthesize/consolidate through Poseidon.
7. An explicit specialist delegation consumes one extra stage with a shared
   bounded attempt budget, not another mandatory three-stage pipeline.
8. API evidence is still produced by the real executor, never by stage count.

## Image path
The image generator receives the original owner request (and reference
images) directly by default. Two planning LLMs are invoked **only** when the
owner explicitly asks for visual pre-planning. Image-model fallbacks remain.
Compare A/B image generation remains a separate explicitly requested workflow.

## Bounded call envelope
| Scenario | Successful model/tool calls (nominal) | Extra recovery allowance |
| --- | --- | --- |
| Specialist direct response | 1 LLM | 1 alternative if needed |
| Specialist independent audit | 2 LLMs | 1 alternative if needed |
| Explicit three-model analysis | 3 LLMs | 1 alternative if needed |
| Specialist + real web search | 1 LLM + 1 web-search tool request | 1 LLM alternative |
| Direct image generation | 1 image provider attempt | Image provider candidates on failure |
| Explicit visual pre-planning | 2 LLMs + 1 image provider attempt | Image provider candidates on failure |
| Explicit Poseidon synthesis | Add 1 LLM | Shared request cap |
| Explicit second specialist delegation | Add 1 LLM | Shared request cap |

These are **nominal counts, not guaranteed prices or response times**. Upstream
tokens, retries, tools and charges may vary by provider. A failed paid attempt
still counts, and a provider request may time out.

## Non-goals and protections
- The deterministic classifier considers only the owner's current request,
  not untrusted retrieved files or models' generated text.
- Never treat model output as proof of file edit, GitHub commit or deployment.
- Do not remove provider fallback or the existing project/owner authorization.
- Do not introduce a new API key or a hidden paid coordinator step.
- Preserve task execution, artifacts, trace identity and scheduled job fences.
- Existing background jobs and retry recovery are audited in later phases.

## Verification gate
- `scripts/specialist-call-policy-tests.mjs` exercises 1/2/3 stages, image
  preflight default, explicit Poseidon synthesis, budgets and source contract.
- Existing tool executor / evidence / skill / Code Agent tests must continue
  passing. Full npm test + Netlify production smoke tests are still required.
