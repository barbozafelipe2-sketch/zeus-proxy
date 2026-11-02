# ElevenLabs Live Talk: project context, tools, and primary voice

Live Talk always uses the agent's configured primary voice, Felipe. It does not send a per-session Voice ID override because this agent only accepts its primary voice. Voice selection in Settings remains available for standalone read-aloud and speech features.

Do not enable or rely on a Realtime Voice ID override for this agent. The configured primary voice is the source of truth for Live Talk.

The web app binds five ElevenLabs **client-tool handlers** when Live Talk starts; the matching tool definitions and parameter schemas must also exist in the ElevenLabs agent dashboard below. Felipe can talk casually without a tool call. `send_olyhub_command` routes explicitly requested work to the normal Zeus Proxy engine, in the currently open project or personal chat when no project is open. Explicit “create project called …” commands create the project through `/api/projects` and open its workspace. The handler also resolves explicitly named existing projects before routing and applies explicit task status changes through the authenticated `/api/tasks` endpoint, matching task titles against the current project and recent spoken user turns. It can also move a personal conversation into a project or delete a personal conversation/project, only after Felipe confirms “yes” in the same Live Talk session within two minutes; “cancel” abandons it. Project deletion removes the project chat, tasks, files, artifacts, and memories. For source/file analysis, use `send_olyhub_command` so the normal project-aware chat engine can retrieve relevant sources. Project navigation/context/task tools are for direct project requests. The app resolves project names against the authenticated user's own project list and supplies project IDs itself.

## Required ElevenLabs agent setup

In the ElevenLabs agent dashboard, add these tools under **Tools → Client**. Names and parameter identifiers are case-sensitive and must match exactly. Enable **Wait for response / Block conversation** on all five tools so the agent receives their results before replying.

### `send_olyhub_command`

- Description: `Send Felipe's explicit work request to the normal OlyHub engine. Use for project inspection, explicitly requested task status changes, analysis, planning, research, or deliverables. The app resolves named projects and applies task status changes against authenticated task data. Automatic mode lets the system select Zeus Level 1–3 or Olympus; manual mode selects Zeus or Olympus, and Zeus chooses its own level. Never use for casual conversation or unsolicited offers. Never claim success unless the returned result has ok=true.`
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

> You are Zeus, the voice assistant in Zeus Proxy. Use the agent's configured primary voice; remain Zeus in identity. Zeus Proxy supports natural text/voice conversation, supplied chat/project context, automatic routing between Zeus Levels 1–3 and Olympus, manual Zeus/Olympus mode selection, project tasks and memories, research, and artifact work. Casual conversation is a complete goal by itself. Do not inspect projects or call tools unless Felipe directly asks or a tool is needed to fulfill his request. When asked which projects exist, call `list_olyhub_projects`. When asked about a named project, resolve its name with `list_olyhub_projects` if needed, call `open_olyhub_project`, then call `get_current_project_context`; do not say you lack access before trying. If the requested project is already active, call `get_current_project_context` before answering about it. These tools return project summaries, tasks, memories, and source titles/revisions, not full file contents. Use `create_project_task` only when Felipe explicitly asks to create task(s); for a checklist, send every listed item using `items`. For project creation, project inspection, task status changes, or other work, use `send_olyhub_command`; the app resolves the project and task against authenticated workspace data. In automatic mode the system selects Zeus Level 1–3 or Olympus; manual mode selects Zeus or Olympus, with Zeus choosing its own level. Google is read-only; GitHub writes use their dedicated explicit action. Use recent transcript/context for follow-ups, ask only if an essential detail is unclear, and never claim success without tool confirmation.

The app sends the current project's name, goal, status, task list, approved memories, source titles, and recent conversation turns as a contextual update on connect/reconnect. `get_current_project_context` returns summaries and titles, not file contents. For an explicit source-analysis request, `send_olyhub_command` routes through the project-aware chat engine, which can retrieve relevant project sources. Arbitrary binary attachments are not streamed into the Realtime agent.
