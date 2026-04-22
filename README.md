# Zeus Proxy

## Do I need environment variables?

It depends on what you are running:

- **`index.html` only (static UI demo):** **No env vars required.**
- **`/api/chat` proxy (server-side OpenAI/Azure call):** **Yes, env vars are required.**

## Required env vars for current API route

The `api/chat.js` function currently expects Azure OpenAI variables:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION` (optional; defaults to `2025-04-01-preview`)

If these are missing, the route returns a `missing_env` error.

## Example `.env.local`

```bash
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.cognitiveservices.azure.com
AZURE_OPENAI_API_KEY=YOUR_KEY
AZURE_OPENAI_DEPLOYMENT=YOUR_DEPLOYMENT
AZURE_OPENAI_API_VERSION=2025-04-01-preview
```
