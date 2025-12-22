export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Health check no browser (pra parar de te irritar com 404)
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/chat" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages[] required" });
    }

    // ===== Azure OpenAI (Chat Completions via endpoint) =====
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT; // ex: https://xxx.cognitiveservices.azure.com
    const key = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT; // ex: Zeus-Core
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2025-04-01-preview";

    if (!endpoint || !key || !deployment) {
      return res.status(500).json({
        error: "missing_env",
        detail:
          "Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT (and optionally AZURE_OPENAI_API_VERSION) in Vercel."
      });
    }

    const systemPrompt = `
You are JARVIS — Felipe's personal assistant.
Be direct, fast, and reliable.
Reply in Portuguese or English based on the user's message.
Always propose the next clear action.
    `.trim();

    const payload = {
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      
    };

    const url =
      `${endpoint.replace(/\/$/, "")}` +
      `/openai/deployments/${encodeURIComponent(deployment)}` +
      `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: "proxy_error", detail: String(err) });
  }
}