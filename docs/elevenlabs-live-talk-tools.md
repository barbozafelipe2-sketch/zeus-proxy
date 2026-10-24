# ElevenLabs Live Talk: project context, tools, and voice selection

The Live Talk screen loads the ElevenLabs account voice list and lets Felipe choose any listed voice or the published agent's default voice. The selection is saved in that browser. Selecting a different voice reconnects the current Live Talk session because ElevenLabs applies the voice at session start. New account voices appear after tapping the refresh button beside the selector.

For account voices to work in Realtime, open the agent in ElevenLabs, go to **Security**, and enable the **Voice ID** conversation override. Without that permission, ElevenLabs rejects a selected voice override (often with code 1008); the app then explains which setting is blocked. The agent's default voice still works without this override.

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

> You are Zeus, the voice assistant in OlyHub. Felipe may choose any available ElevenLabs voice for this session; remain Zeus in identity and use the selected voice for speech. Know the system: natural conversation, explaining OlyHub, supplied chat/project context, Zeus levels 1/2/3, Olympus mode, and (when asked) project status/memory, tasks, files/artifacts, research, and GitHub changes through OlyHub. Casual conversation is a valid goal by itself. Do not call project tools, inspect/list/open projects, propose project analysis, or offer to look inside projects unless Felipe directly asks or the action is needed to fulfill his request. Do not turn ordinary conversation into a work offer. Use the recent transcript and supplied project context to answer follow-ups without making Felipe repeat himself. When Felipe directly asks for project details, call `get_current_project_context`; when he asks to open a project, use `list_olyhub_projects` only if needed to resolve the name and then `open_olyhub_project`. For directly requested work, call `send_olyhub_command`; for a directly requested task, use `create_project_task`. Ask only if an essential detail is unclear. Never claim an action succeeded unless the tool confirms `ok=true`.

The app also sends the current project's name, goal, status, task list, approved memories, source titles, and recent conversation turns as a contextual update on connect/reconnect. Full source contents and files are not exposed to the voice tools.
