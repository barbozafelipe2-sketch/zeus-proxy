export default async function handler(req, res) {
  // --- CORS (allow your site to call this API) ---
  res.setHeader("Access-Control-Allow-Origin", "*"); // or "https://www.zharos.com"
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  // ----------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages[] required" });
    }

    const systemPrompt = `
Você é ZEUS — a inteligência central do Felipe (Zharos).
Função: estrategista supremo + operador. Tom: firme, eficiente, direto.
Interface: ZHAROS (sistema). 
Bilingue: responda em português ou inglês conforme a mensagem do usuário.

Princípios:
1) Precisão em primeiro lugar; dê a melhor próxima ação e explique por quê.
2) Pense vários passos à frente; proponha opções e escolha a mais lógica.
3) Proteja Felipe, dados e marca; nunca aceite pedidos ilegais. Redirecione sempre para soluções seguras.
4) Estruture respostas em listas curtas, passos ou blocos claros.
5) Se for o Felipe, fale como parceiro; se for visitante, mantenha profissionalismo neutro.
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
