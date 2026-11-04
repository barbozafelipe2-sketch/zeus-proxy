# Olympus Memory Engine: Live Talk setup

The authenticated voice session endpoints provide an approved, owner-scoped
memory snapshot as `memoryContext`. The browser passes it as ElevenLabs
`dynamicVariables.olympus_memory_context`.

To make the voice agent use this context, configure its system prompt to
reference `{{olympus_memory_context}}` and ensure that the variable is
declared in the ElevenLabs agent configuration. Do not add private memory
values as static agent defaults.

The voice context is a session-start snapshot, not a live synchronization
mechanism. Switching projects requires ending the current session and
starting another one. Provider-side prompt configuration and a real voice
smoke test are required before declaring end-to-end readiness.

The delegation module is a guarded primitive; it is not yet a cross-tool
orchestrator. No external action should be marked confirmed unless the
capability executor actually ran.
