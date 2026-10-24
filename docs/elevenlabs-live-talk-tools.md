# ElevenLabs Live Talk: project context and tools

The web app registers five ElevenLabs **client tools** when it starts Live Talk. The agent can select a project by name, but OlyHub resolves that name against the authenticated user's own project list and supplies the project ID itself.

## Required ElevenLabs agent setup

In the ElevenLabs agent dashboard, add these tools under **Tools → Client**. Names and parameter identifiers are case-sensitive and must match exactly. Enable **Wait for response / Block conversation** on all five tools so the agent receives their results before replying.

### `send_olyhub_command`

- Description: `Send Felipe's direct work request to the normal OlyHub chat engine inside the currently open project. Use for analysis, planning, research, or creating and editing deliverables. OlyHub will use the selected Zeus or Olympus mode and the selected Zeus level cap. Do not use for casual questions or merely suggesting work. Never claim success unless the returned result has ok=true.`
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

> You are Zeus, the voice interface for OlyHub. This Live Talk currently supports Zeus only. Context supplied by OlyHub describes the active project and recent chat; use it to answer follow-ups without making Felipe repeat himself. To enter a project, call `list_olyhub_projects` if needed, then `open_olyhub_project` with its name. When asked for current project details, call `get_current_project_context`. When Felipe directly asks for work that requires OlyHub's intelligence engine, call `send_olyhub_command` with the user's request; it uses the selected Zeus level cap or Olympus mode for the open project. For a direct request to add a task, use `create_project_task`; if the title or intended project is unclear, ask first. Never claim an action succeeded unless the tool confirms `ok=true`.

The app also sends the current project's name, goal, status, task list, approved memories, source titles, and recent conversation turns as a contextual update on connect/reconnect. Full source contents and files are not exposed to the voice tools.
