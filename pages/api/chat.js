<!-- ZEUS Floating Chat Bubble -->
<style>
  #zeus-bubble {
    position: fixed; right: 18px; bottom: 18px; z-index: 999999;
  }
  #zeus-bubble button {
    border: 0; border-radius: 50%; width: 64px; height: 64px;
    background: linear-gradient(135deg,#5ee2ff,#61a0ff,#7b57ff);
    color: #0b0f17; font-weight: 800; cursor: pointer;
  }
  #zeus-panel {
    position: fixed; right: 18px; bottom: 90px; width: 360px; max-width: 92vw;
    height: 500px; background: #0b0f17; color: #e8f1ff;
    border: 1px solid #1a2233; border-radius: 14px; box-shadow: 0 12px 28px rgba(0,0,0,.38);
    display: none; flex-direction: column; overflow: hidden; z-index: 999999;
  }
  #zeus-head {
    padding: 10px 12px; border-bottom: 1px solid #1a2233;
    display: flex; justify-content: space-between; align-items: center;
  }
  #zeus-log {
    flex: 1; overflow-y: auto; padding: 10px 12px; background: #0f1522;
  }
  .msg-row { display: flex; margin: 6px 0; }
  .msg-me { justify-content: flex-end; }
  .bubble {
    padding: 10px 12px; border-radius: 12px; max-width: 80%;
    white-space: pre-wrap; line-height: 1.35; font-size: 14px;
  }
  .bubble.me { background: #1a2233; color: #e8f1ff; }
  .bubble.you { background: #0f1323; color: #e8f1ff; }
  #zeus-form { display: flex; gap: 6px; padding: 10px; border-top: 1px solid #1a2233; background: #0b0f17; }
  #zeus-input {
    flex: 1; background: #0f1522; border: 1px solid #1a2233; border-radius: 10px;
    color: #e8f1ff; padding: 10px;
  }
  #zeus-send {
    background: #141c2b; color: #e8f1ff; border: 1px solid #1a2233;
    border-radius: 10px; padding: 10px 12px; cursor: pointer;
  }
</style>

<div id="zeus-bubble"><button id="zeus-open">ZEUS</button></div>

<div id="zeus-panel">
  <div id="zeus-head">
    <strong>ZEUS — Core AI</strong>
    <button id="zeus-close" style="background:none;border:0;color:#e8f1ff;font-size:18px;cursor:pointer">✕</button>
  </div>
  <div id="zeus-log"></div>
  <form id="zeus-form">
    <input id="zeus-input" type="text" placeholder="Talk to ZEUS..."/>
    <button id="zeus-send" type="submit">Send</button>
  </form>
</div>

<script>
(function(){
  // 🔗 Put YOUR real deployed Vercel endpoint here:
  const PROXY_URL = "https://zeus-proxy.vercel.app/api/chat";

  const openBtn = document.getElementById("zeus-open");
  const panel = document.getElementById("zeus-panel");
  const closeBtn = document.getElementById("zeus-close");
  const log = document.getElementById("zeus-log");
  const form = document.getElementById("zeus-form");
  const input = document.getElementById("zeus-input");
  let history = [];

  function addMsg(text, who){
    const row = document.createElement("div");
    row.className = "msg-row " + (who==="me"?"msg-me":"");
    const b = document.createElement("div");
    b.className = "bubble " + (who==="me"?"me":"you");
    b.textContent = text;
    row.appendChild(b);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  async function sendMsg(text){
    addMsg(text,"me");
    history.push({ role:"user", content:text });
    try{
      const r = await fetch(PROXY_URL,{
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ messages: history })
      });
      const data = await r.json();
      const msg = data?.choices?.[0]?.message?.content || "(no reply)";
      addMsg(msg,"you");
      history.push({ role:"assistant", content: msg });
    }catch(e){ addMsg("⚠️ Connection error.", "you"); }
  }

  openBtn.addEventListener("click",()=>{panel.style.display="flex"; if(history.length===0){ sendMsg("Felipe connected. Zeus, prepare the system."); }});
  closeBtn.addEventListener("click",()=>{panel.style.display="none";});
  form.addEventListener("submit",(e)=>{e.preventDefault();const t=input.value.trim();if(!t)return;input.value="";sendMsg(t);});
})();
</script>
<!-- /ZEUS Floating Chat Bubble -->
