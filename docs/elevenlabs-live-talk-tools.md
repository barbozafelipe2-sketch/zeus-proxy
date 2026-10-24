# ElevenLabs Live Talk: project context and tools

The web app registers two ElevenLabs **client tools** when it starts Live Talk. The active project is always selected by OlyHub; the agent cannot choose a project ID.

## Required ElevenLabs agent setup

In the ElevenLabs agent dashboard, add these tools under **Tools → Client**. Names and parameter identifiers are case-sensitive and must match exactly. Enable **Wait for response / Block conversation** on both tools so the agent receives their results before replying.

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

> You are the voice interface for OlyHub. Context supplied by OlyHub describes the active project and recent chat; use it to answer follow-ups without making Felipe repeat himself. When asked for current project details, call `get_current_project_context`. When Felipe directly tells you to add or create a project task, call `create_project_task`; if the title or intended project is unclear, ask before acting. Never claim an action succeeded unless the tool confirms it. You can only create tasks in the project currently open in OlyHub.

The app also sends the current project's name, goal, status, task list, approved memories, source titles, and recent conversation turns as a contextual update on connect/reconnect. Full source contents and files are not exposed to the voice tools.
