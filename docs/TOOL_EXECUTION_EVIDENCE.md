# OlyHub — Tool Execution Evidence Contract (2/7)

Status: implemented in source, pending Netlify deploy and live provider validation.
Owner: Zeus Proxy; current branch: main.
Scope: truthful attribution, routing to existing executors, no expanded permissions.

## Core principle
A selected Realm, a user request, a model's own claims, three model roles, a provider
response or a staged blob is NOT proof that an external operation occurred.

The assistant message and execution trace distinguish:
- `not_executed`: no verified tool operation and no counted specialist model stages.
- `model_only`: specialist model stages completed; **no external operation confirmed**.
- `read_verified`: a server-side web search or GitHub repository read completed with
  a bounded receipt; this is **read-only**, not a code change or deployment.
- `artifact_saved`: the image/document artifact was inserted into the owner's
  artifacts table within the successful turn transaction.

Persisted assistant metadata: `skillId`, `skillGod`, `skillStagesCompleted`,
`skillExecutionStatus`, `skillExecutionEvidence`, `skillCapabilityExecuted`.
Legacy `skillExecuted` now means **verified capability**, not just a model pipeline.

## Workflow mapping
| Specialist | Existing real executor | What can be verified |
| --- | --- | --- |
| Athena Research (`web`) | `runWebSearch` with OpenAI web-search tool | Request ID + nonempty retrieved source count, read-only |
| Hefesto (`code`) | `/api/code-agent`, code-agent background, GitHub sandbox and commit | Dedicated job/status/commit SHA; model-only code chat must not claim a commit |
| Hefesto (`code`) read path | `loadGitHubContext` | Repository + loaded source-file count, read-only |
| Apollo (`images`) | `generateImage` / `editImage`, `stageBinaryArtifact`, artifact persistence | Created, owner-scoped artifact ID (not merely generated model text) |
| Athena Documents (`documents`) | `parseArtifactDelivery` / `stageArtifact` + transaction | Created, owner-scoped PDF/Word/other supported artifact ID |
| Héstia (`analysis`) | Independent model review; optional repository read | Review alone remains model-only; verified read is read-only |

## Execution safety
1. The deterministic classifier routes explicit code mutation requests in normal
   and Hefesto-specific chats to the existing Code Agent instead of relying on
   the model-only three-stage path.
2. A repository is selected explicitly, scoped to the authenticated owner and
   existing conversation/project; Code Agent requires a roadmap approval before
   its GitHub write workflow.
3. The separate Code Agent job is the source of truth for tests, commits and
   publication; its status must never be inferred from another model response.
4. Web and GitHub reads are never labeled as edits, deployments or commits.
5. Artifact proof is computed **after database insertion** in the transaction
   that commits the assistant message; error/rollback cannot produce proof.
6. A callback or model-provided JSON cannot certify artifact persistence.
7. Retry/idempotency, pricing and worker recovery remain independent tasks in
   later phases. This contract alone does not prove live Netlify deployment.

## Validation
Source changes and regression tests:
- `scripts/tool-execution-evidence-tests.mjs`
- `scripts/tool-executor-tests.mjs`
- `scripts/skill-engine-tests.mjs`
- `scripts/code-agent-tests.mjs`

Live follow-up: deploy the matching commit to the correct Netlify site, then test
one real web source read, one generated and persisted image/document, one model-only
code audit, and a separate Code Agent job that proceeds only after approval.
