# Zeus Proxy — Personal Olympus Hub

**Version:** OH-004.3.4 Personal Recovery

Zeus Proxy is Felipe's private Netlify edition of Olympus Hub.

## Personal access

**Access-token auth is removed.** The app is open; protect the site with **Netlify site password** if desired.

## Zeus Levels

| Level | Internal | Typical tasks |
|------|----------|----------------|
| **1** | SIMPLE | Basic chat, translation, short answers |
| **2** | COMPOUND | Simple PDF/docs, logos, moderate code, **image generation** |
| **3** | ZEUS_DIRECTED | Advanced UI/frontend, isolated backend, complex reports, books |
| **Olympus** | multi-specialist | Full assemble: UI + code + integration, audits |

**Compare & Evolve** (Tools) and the **Like** button on replies record preferred model families per task type (`familyPreferences`).

## Agents + Manager

UI renames **Projects → Agents**. Each agent keeps an isolated permanent chat, memory, sources and artifacts. **Home** is the Manager with an agent chip strip. API routes remain `/api/projects` for compatibility.

A deterministic zero-token router chooses Zeus Level 1 / 2 / 3; Olympus is a single multi-specialist mode. Provider keys stay on Netlify AI Gateway.
