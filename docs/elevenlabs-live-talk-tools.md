# Poseidon Voice: ElevenLabs tools, project context, and Athena identity

Poseidon Voice uses Athena as its shared agent identity across OpenAI Realtime and ElevenLabs Realtime. OpenAI Realtime is the default provider; ElevenLabs Realtime is selectable. The ElevenLabs agent uses its configured primary Athena voice and does not receive a per-session Voice ID override. Provider-specific timbre settings do not change Athena identity or Poseidon context.

This guide covers only the ElevenLabs adapter and its client tools. Google Gemini Live is not a selectable Poseidon Voice provider.

The web app binds five ElevenLabs **client-tool handlers** when Live Talk starts; the matching tool definitions and parameter schemas must also exist in the ElevenLabs agent dashboard below. Live Talk can start in the main chat or a project's Chat section. Specialist Realm/tool chats remain text-only. Felipe can talk casually without a tool call. `send_olyhub_command` routes explicitly requested work to Poseidon inside the currently selected project; if Felipe names another existing project, the app resolves it from the authenticated project list and switches the active project before routing. Project creation remains available through the project action flow, and explicit task status changes use the authenticated `/api/tasks` endpoint, matching task titles against the active project and recent spoken user turns. Destructive project or conversation changes still require their separate confirmation flow. For source/file analysis, use `send_olyhub_command` so Poseidon can use the normal project-aware context and retrieval path. The app supplies project IDs itself; model-provided IDs are not trusted.

## Required ElevenLabs agent setup

In the ElevenLabs agent dashboard, add these tools under **Tools → Client**. Names and parameter identifiers are case-sensitive and must match exactly. Enable **Wait for response / Block conversation** on all five tools so the agent receives their results before replying.

### `send_olyhub_command`

- Description: `Send Felipe's explicit work request to Poseidon, the OlyHub Core coordinator. Use for project inspection, explicitly requested task status changes, analysis, planning, research, or deliverables. Poseidon routes eligible work to the appropriate specialist using the backend catalog and policy. The app resolves named projects and applies task status changes against authenticated task data. Never use for casual conversation or unsolicited offers. Never claim success unless the returned result has ok=true.`
- `command` — string, required; the user's actual request and necessary voice context, maximum 40,000 characters
- Wait for response: enabled

### `list_olyhub_projects`

- Description: `List Felipe's OlyHub projects by name, goal, status, and progress. Use this before opening a project when the requested name is unclear. This tool takes no parameters.`
- Parameters: none
- Wait for response: enabled

### `open_olyhub_project`

- Description: `Open one of Felipe's OlyHub projects by its name so you can work inside that project. Call list_olyhub_projects first if the name is ambiguous. Never invent a project name.`
- `project_name` — string, required; exact or unique partial project name
- Wait for response: enabled

### `get_current_project_context`

- Description: `Read the currently open OlyHub project's goal, status, tasks, approved memories, and source titles. Use this when Felipe asks about project progress, prior decisions, or existing work. It takes no parameters.`
- Parameters: none
- Wait for response: enabled

### `create_project_task`

- Description: `Create a task in the currently open OlyHub project only when Felipe directly asks to add or create a task. Do not use for vague ideas or suggestions. If important details are unclear, ask first. Return the result to Felipe.`
- `title` — string, optional; one task title, maximum 200 characters
- `items` — array, optional; up to 30 checklist entries, each either a title string or an object with `title`, optional `description`, `priority`, and `dueAt`. Use this for “turn each checklist item into a task.”
- `description` — string, optional; task details, maximum 2000 characters
- `priority` — string, optional; `LOW`, `MEDIUM`, or `HIGH` (defaults to `MEDIUM`)
- `dueAt` — string, optional; ISO 8601 date/time
- Wait for response: enabled

## Agent prompt addition

Add this to the agent's system prompt:

> You are Athena, the voice agent for Poseidon Voice in OlyHub Core. Speak naturally using the configured primary voice. Poseidon Text and Poseidon Voice share the active project's chat, context, approved memories, permissions, and tool path. Live Talk follows the active personal or project conversation; preserve that scope when returning results. Casual conversation is a complete goal by itself. Do not inspect projects or call tools unless Felipe directly asks or a tool is needed to fulfill his request. When asked which projects exist, call `list_olyhub_projects`. When asked about a named project, resolve its name with `list_olyhub_projects` if needed, call `open_olyhub_project`, then call `get_current_project_context`; do not say you lack access before trying. If the requested project is already active, call `get_current_project_context` before answering about it. These tools return project summaries, tasks, memories, and source titles/revisions, not full file contents. Use `create_project_task` only when Felipe explicitly asks to create task(s); for a checklist, send every listed item using `items`. For project creation, project inspection, task status changes, or other work, use `send_olyhub_command`; Poseidon routes the request through the authenticated OlyHub engine and returns the result to the active project chat. There is no user-facing Zeus Levels or Zeus/Olympus mode selection. Google Gmail, Calendar and Drive lookups in chat are read-only. Drive document publishing is available only through the separate project review-and-confirm UI; never publish from chat, model output, or a GET request. GitHub writes use their dedicated explicit action. Use recent transcript/context for follow-ups, ask only if an essential detail is unclear, and never claim success without tool confirmation.

The app sends the current project's name, goal, status, task list, approved memories, source titles, and recent conversation turns as a contextual update on connect/reconnect. `get_current_project_context` returns summaries and titles, not file contents. For an explicit source-analysis request, `send_olyhub_command` routes through the project-aware chat engine, which can retrieve relevant project sources. Arbitrary binary attachments are not streamed into the Realtime agent.
