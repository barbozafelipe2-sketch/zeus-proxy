# Automatic and manual execution routing

The chat composer offers two policies:

- **Automatic:** the server chooses between Zeus and Olympus for each request. If it chooses Zeus, the deterministic level router selects Zeus Level 1–3. Olympus selection still uses the existing budget, authorization, concurrency, and approval gates.
- **Manual:** the owner chooses Zeus or Olympus. Zeus still selects its own level (1–3); there is no manual level cap. Tool conversations continue to use their dedicated Zeus Level 3 workflow.

The policy is a browser preference and is sent with each chat request. Live Talk's fast conversational turn remains on the Zeus fast path; explicit work commands use the selected routing policy.

Assistant messages include a collapsed **Trace Lab** showing the provider, model, execution stage, route, duration, and success/failure for each actual model call. Failed calls remain visible alongside successful fallback calls, so the trace distinguishes an attempted model from one that completed a stage. Provider telemetry is already persisted with the execution; the message metadata copies only a bounded, sanitized list for display.

Image creation/editing retains its existing specialized routing. Comparison/Combine remain explicit actions; the routing change does not generate extra versions automatically. Failed chat requests retain existing retry, deduplication, attempt-ledger, and completed-stage resume behavior.

Validation uses mocked providers; live provider and mobile integration still require separate verification.
