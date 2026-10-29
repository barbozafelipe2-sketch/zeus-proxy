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
export function modelTransport(){return 'gateway';}
export function modelCircuitScope(model={}){return String(model.provider||'unknown');}
export function modelRouteIdentity(model={}){return 'gateway:'+String(model.provider||'')+':'+String(model.id||'');}
export function buildTransportRoutes(ranked=[],{limit=4,gatewayEnabled=()=>true}={}){
  const cap=Math.max(1,Math.min(5,Math.trunc(Number(limit)||4))),out=[],seen=new Set();
  for(const model of Array.isArray(ranked)?ranked:[]){
    if(!model||!gatewayEnabled(model))continue;
    const key=modelRouteIdentity(model);if(seen.has(key))continue;
    seen.add(key);out.push({...model,transport:'gateway'});
    if(out.length>=cap)break;
  }
  return out;
}
