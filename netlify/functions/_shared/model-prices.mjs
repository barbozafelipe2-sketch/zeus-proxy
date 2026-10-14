// ESTIMATED list prices in USD per 1M tokens (input/output). Used only for an
// "estimated" display; the provider/Netlify billing page is authoritative.
// Models without a known price are reported as unpriced (no guessing).
// Override/extend with OLYHUB_MODEL_PRICES_JSON='{"model-id":{"in":0.4,"out":1.6}}'.
const BUILTIN={
  'gpt-4.1-mini':{in:0.4,out:1.6},
  'gpt-5':{in:1.25,out:10},
  'gpt-5-mini':{in:0.25,out:2},
};
function overrides(){
  try{
    const raw=globalThis.Netlify?.env?.get?.('OLYHUB_MODEL_PRICES_JSON')||(typeof process!=='undefined'?process.env?.OLYHUB_MODEL_PRICES_JSON:'')||'';
    const parsed=raw?JSON.parse(raw):{};
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch{return {};}
}
export function priceFor(modelId=''){
  const id=String(modelId||'').replace(/^[a-z-]+\//,'').toLowerCase();
  const table={...BUILTIN,...overrides()};
  const p=table[modelId]||table[id];
  return p&&Number.isFinite(Number(p.in))&&Number.isFinite(Number(p.out))?{in:Number(p.in),out:Number(p.out)}:null;
}
