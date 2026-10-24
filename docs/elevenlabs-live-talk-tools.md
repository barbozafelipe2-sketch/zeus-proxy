# ElevenLabs Live Talk: project context, tools, and primary voice

Live Talk always uses the agent's configured primary voice, Felipe. It does not send a per-session Voice ID override because this agent only accepts its primary voice. Voice selection in Settings remains available for standalone read-aloud and speech features.

Do not enable or rely on a Realtime Voice ID override for this agent. The configured primary voice is the source of truth for Live Talk.

The web app registers five ElevenLabs **client tools** when it starts Live Talk. Felipe can talk casually without a tool call. `send_olyhub_command` routes explicitly requested work to the normal Zeus Proxy engine, in the currently open project or the personal chat when no project is open. Project navigation/context/task tools are only for direct project requests. The app resolves project names against the authenticated user's own project list and supplies the project ID itself.

## Required ElevenLabs agent setup

In the ElevenLabs agent dashboard, add these tools under **Tools → Client**. Names and parameter identifiers are case-sensitive and must match exactly. Enable **Wait for response / Block conversation** on all five tools so the agent receives their results before replying.

### `send_olyhub_command`

- Description: `Send Felipe's explicit work request to the normal OlyHub chat engine. Use the currently open project when there is one; otherwise use his personal chat. Use for requested analysis, planning, research, or creating/editing deliverables. OlyHub applies the selected Zeus level or Olympus mode. Never use for casual conversation, project inspection, or unsolicited offers. Never claim success unless the returned result has ok=true.`
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
- `title` — string, required; task title, maximum 200 characters
- `description` — string, optional; task details, maximum 2000 characters
- `priority` — string, optional; `LOW`, `MEDIUM`, or `HIGH` (defaults to `MEDIUM`)
- `dueAt` — string, optional; ISO 8601 date/time
- Wait for response: enabled

## Agent prompt addition

Add this to the agent's system prompt:

> You are Zeus, the voice assistant in Zeus Proxy. Felipe may choose any available ElevenLabs voice for this session; remain Zeus in identity and use the selected voice for speech. Zeus Proxy supports natural text/voice conversation, supplied chat/project context, Zeus levels 1/2/3, Olympus mode, project tasks and memories, research, and artifact work. Casual conversation is a complete goal by itself. Do not inspect projects or call tools unless Felipe directly asks or a tool is needed to fulfill his request. When asked which projects exist, call `list_olyhub_projects`. When asked about a named project, resolve its name with `list_olyhub_projects` if needed, call `open_olyhub_project`, then call `get_current_project_context`; do not say you lack access before trying. If the requested project is already active, call `get_current_project_context` before answering about it. These tools return project summaries, tasks, memories, and source titles/revisions, not full file contents. Use `create_project_task` only when Felipe explicitly asks to create a task. For other directly requested work call `send_olyhub_command`, which uses the normal Zeus Proxy engine and selected mode/level. Google is read-only; GitHub writes use their dedicated explicit action. Use recent transcript/context for follow-ups, ask only if an essential detail is unclear, and never claim success without tool confirmation.

The app also sends the current project's name, goal, status, task list, approved memories, source titles, and recent conversation turns as a contextual update on connect/reconnect. Full source contents and files are not exposed to the voice tools.
