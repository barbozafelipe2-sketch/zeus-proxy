// Pure, deterministic transport routing. No model calls and no secrets in this module.
// "provider" is the API adapter; "family" is the model origin; "transport" is the billing/network route.
const aliases=Object.freeze({'google':'gemini','x-ai':'xai','xai':'xai','openai':'openai','anthropic':'anthropic','gemini':'gemini'});
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
  return transport==='gateway'?String(model.provider||'unknown'):transport;
}
export function modelRouteIdentity(model={}){
  return modelTransport(model)+':'+String(model.provider||'')+':'+String(model.id||'');
}
const routerModels=Object.freeze({
  openai:'openai/gpt-5',
  anthropic:'anthropic/claude-sonnet-4.5',
  gemini:'google/gemini-2.5-flash'
});
function asRouterModel(model){
  const family=modelFamily(model),id=model.provider==='openrouter'?model.id:routerModels[family];
  return id?{...model,id,provider:'openrouter',family,transport:'openrouter_direct'}:null;
}
function uniqueRoutes(items=[]){
  const seen=new Set(),out=[];
  for(const model of items){
    if(!model)continue;
    const key=modelRouteIdentity(model);
    if(!seen.has(key)){seen.add(key);out.push(model);}
  }
  return out;
}
// A hard cap counts actual outbound HTTP attempts, not candidate models.
// Gateway is primary; separate user-owned OpenRouter and OpenAI keys are the only independent routes.
// The injected OPENROUTER_API_KEY from Netlify is NOT treated as an independent fallback credential.
export function buildTransportRoutes(ranked=[],{
  limit=4,gatewayEnabled=()=>true,openrouterDirect=false,openaiDirect=false,openaiDirectModel='gpt-5'
}={}){
  const cap=Math.max(1,Math.min(5,Math.trunc(Number(limit)||4)));
  const pool=uniqueRoutes(Array.isArray(ranked)?ranked:[]);
  const gateway=pool.filter(m=>gatewayEnabled(m)).map(m=>({...m,transport:'gateway'}));
  const router=openrouterDirect?uniqueRoutes(pool.map(asRouterModel)):[];
  const directOpenai=openaiDirect?uniqueRoutes(pool.filter(m=>modelFamily(m)==='openai').map(m=>({
    ...m,provider:'openai',id:openaiDirectModel,family:'openai',transport:'openai_direct'
  }))):[];
  if(!router.length&&!directOpenai.length)return gateway.slice(0,cap);
  const result=[];
  const reserves=(router.length?1:0)+(directOpenai.length?1:0);
  const gatewaySlots=gateway.length?Math.max(1,cap-reserves):0;
  result.push(...gateway.slice(0,gatewaySlots));
  // An unavailable Gateway cannot exhaust all remaining attempts before independent transports.
  if(router.length&&result.length<cap)result.push(router[0]);
  if(directOpenai.length&&result.length<cap)result.push(directOpenai[0]);
  for(const next of [...router.slice(1),...directOpenai.slice(1),...gateway.slice(gatewaySlots)]){
    if(result.length>=cap)break;
    if(!result.some(m=>modelRouteIdentity(m)===modelRouteIdentity(next)))result.push(next);
  }
  return result;
}
