# Poseidon routing and tool delegation

Poseidon Text and Poseidon Voice are the OlyHub Core coordinator. There is no user-facing Zeus/Olympus mode or L1/L2/L3 selector. Poseidon receives the shared context, identifies the task, and delegates eligible work to a dedicated specialist using the backend catalog and routing policy.

Text-model routing follows a bounded transport order: a task-appropriate native provider through Netlify AI Gateway (Anthropic, Gemini, or OpenAI), then an OpenRouter model through Netlify AI Gateway, then direct Google/OpenAI only when the corresponding explicit `GEMINI_DIRECT_API_KEY` or `OPENAI_DIRECT_API_KEY` is configured. Anthropic and OpenRouter do not need personal provider keys, and no direct Anthropic or OpenRouter route is used. Direct recovery preserves task capability: Gemini Pro/OpenAI Sol for writing, research, and coding; Gemini Pro/OpenAI Astra for hard requests; multimodal Gemini Flash/OpenAI vision model for image input; Gemini Flash/OpenAI Luna for ordinary fast requests. Production credentials and live provider availability still require deployment-side verification.

Routing uses quality/cost tiers. Simple turns use economical capable models; writing, research, and coding use stronger task-matched models; hard requests can escalate to GPT Astra, and only when classified hard. Fallback is triggered by transport/provider failure and keeps the route's capability class; it does not claim to detect subjective answer quality after a successful response.

Live Talk is project-scoped. It can be started only from a project's Chat section; its voice requests, refreshed context, and persisted transcript use that project conversation. Realm pages are text-only for now. A future Realm-specific voice can use a separate voice identity while still delegating through the same backend policy and returning results to an explicitly selected project's chat.

The specialist filter excludes the xAI family from tool execution. A specialist's actual response returns to Poseidon for delivery; the coordinator should not silently replace the dedicated tool workflow with its own execution.

## Deity and capability catalog

The canonical roles are Athena (research and knowledge), Hefesto (engineering and code), Apollo (visual design and images), Dionísio (audio and video), Peitho (marketing and acquisition), Deméter (commerce and business operations), Hermes (communications), and Hades (security). Current callable model workflows are Athena research/documents, Hefesto code, and Apollo images. Hermes has read-only Gmail, Calendar, and Drive integrations through Settings and Poseidon chat. Dionísio, Peitho, Deméter, and the dedicated Hades Realm are not yet implemented as callable specialist tools.

Héstia review and Mnemosine memory are internal Core capabilities, not independent Realms. Existing conversation/tool IDs such as `web`, `documents`, `code`, and `images` remain stable for stored data and permissions; the visible owners and labels follow the current canon.

## Zeus director/auditor status

Zeus is a separate director/auditor surface, not the chat coordinator. The current UI is a shell. Independent ingestion of execution, cost, failure, and approval evidence—and synchronous enforcement that can block critical actions—remain unimplemented. Do not present the shell as an active auditor or claim that it monitors Poseidon.

Assistant messages include a collapsed **Trace Lab** showing provider, model, execution stage, route, duration, and success/failure for recorded model calls. Failed calls remain visible alongside successful fallback calls. This per-execution trace is not the independent Zeus audit pipeline described above.

Image creation/editing retains its existing specialized routing. Comparison/Combine remain explicit actions; the routing change does not generate extra versions automatically. Failed chat requests retain existing retry, deduplication, attempt-ledger, and completed-stage resume behavior.

Validation uses mocked providers; live provider and mobile integration still require separate verification. Internal legacy route and database identifiers may still contain “Zeus” or “Olympus”; they do not create a user-facing mode selector.
