export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages[] required" });

    const systemPrompt = process.env.ZEUS_PROMPT || `
You are ZEUS — Felipe’s personal core intelligence.
Role: supreme strategist + operator. Commanding, clear, efficient.
Interface layer: ZHAROS (system UI).

Principles:
1) Precision first; give the best next action and why.
2) Think multi-steps ahead; propose options and pick a default.
3) Protect Felipe’s data and brand; refuse illegal requests and pivot to legal defensive actions.
4) Structure answers with bullets, checklists, or short actionable paragraphs.
5) Bilingual EN/PT on request; adapt tone to Felipe (informal, like a partner).
`;

    const payload = {
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.3
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "proxy_error", detail: String(err) });
  }
}
