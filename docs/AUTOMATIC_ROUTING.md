# Poseidon routing and tool delegation

Poseidon Text and Poseidon Voice are the OlyHub Core coordinator. There is no user-facing Zeus/Olympus mode or L1/L2/L3 selector. Poseidon receives the shared context, identifies the task, and delegates eligible work to a dedicated specialist using the backend catalog and routing policy.

The preferred coordinator model is `x-ai/grok-4.3` through the configured OpenRouter route, normally Netlify AI Gateway. The backend may select a fallback according to availability and policy. Production credentials, live model availability, and current price have not been verified by repository tests.

The specialist filter excludes the xAI family from tool execution. A specialist's actual response returns to Poseidon for delivery; the coordinator should not silently replace the dedicated tool workflow with its own execution.

## Zeus director/auditor status

Zeus is a separate director/auditor surface, not the chat coordinator. The current UI is a shell. Independent ingestion of execution, cost, failure, and approval evidence—and synchronous enforcement that can block critical actions—remain unimplemented. Do not present the shell as an active auditor or claim that it monitors Poseidon.

Assistant messages include a collapsed **Trace Lab** showing provider, model, execution stage, route, duration, and success/failure for recorded model calls. Failed calls remain visible alongside successful fallback calls. This per-execution trace is not the independent Zeus audit pipeline described above.

Image creation/editing retains its existing specialized routing. Comparison/Combine remain explicit actions; the routing change does not generate extra versions automatically. Failed chat requests retain existing retry, deduplication, attempt-ledger, and completed-stage resume behavior.

Validation uses mocked providers; live provider and mobile integration still require separate verification. Internal legacy route and database identifiers may still contain “Zeus” or “Olympus”; they do not create a user-facing mode selector.
