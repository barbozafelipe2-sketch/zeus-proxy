const aliases=Object.freeze({google:'gemini','x-ai':'xai',xai:'xai',openai:'openai',anthropic:'anthropic',gemini:'gemini'});
export function modelFamily(model={}){
  if(model.family)return aliases[String(model.family).toLowerCase()]||String(model.family).toLowerCase();
  const api=String(model.provider||'').toLowerCase();
  if(api==='openrouter'){
    const name=String(model.id||'').split('/')[0].toLowerCase();
    return aliases[name]||name||'openrouter_unknown';
  }
  return aliases[api]||api;
}
export function modelTransport(model={}){return model.transport||'gateway';}
export function modelCircuitScope(model={}){
  const transport=modelTransport(model);
  return transport==='gateway'?String(model.provider||'unknown'):`${String(model.provider||'unknown')}_${transport}`;
}
export function modelRouteIdentity(model={}){return modelTransport(model)+':'+String(model.provider||'')+':'+String(model.id||'');}
export function buildTransportRoutes(ranked=[],{limit=5,gatewayEnabled=()=>true,directEnabled=()=>false}={}){
  const cap=Math.max(1,Math.min(5,Math.trunc(Number(limit)||4))),out=[],seen=new Set();
  for(const model of Array.isArray(ranked)?ranked:[]){
    if(!model)continue;
    const requested=modelTransport(model);
    if(requested!=='gateway'&&!((requested==='openai_direct'&&model.provider==='openai')||(requested==='gemini_direct'&&model.provider==='gemini')))continue;
    const enabled=requested==='gateway'?gatewayEnabled(model):directEnabled(model,requested);
    if(!enabled)continue;
    const key=modelRouteIdentity(model);if(seen.has(key))continue;
    seen.add(key);out.push({...model,transport:requested});
    if(out.length>=cap)break;
  }
  return out;
}
