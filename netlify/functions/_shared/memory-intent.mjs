const HISTORY_STOP_WORDS=new Set('about after again and antes aqui are as at com como conversa conversas could did do dos das ela ele em eu for from have how in into is isso it me my na no nos o of on or our para por que sobre the this to we what when where which who with you your previously anterior passadas falamos'.split(' '));

export function explicitMemoryIntent(text){
  return /\b(remember|memorize|keep in mind|save this|lembre|lembra|memorize|guarde|salve.*mem[oó]ria|mantenha.*em mente)\b/i.test(String(text||''));
}

export function memoryContentFromRequest(text){
  return String(text||'').replace(/^\s*(?:(?:hey\s+)?zeus[, :]\s*)?(?:please\s+)?(?:remember(?:\s+(?:that|this))?|keep in mind(?: that)?|lembre-se(?: que)?|lembra(?: que)?|guarde(?: que| isso| isto)?|memorize(?: que)?|save this|salve(?: isso| isto)?)[\s,:;-]*/i,'').trim();
}

export function explicitHistoryIntent(text){
  return /\b(previous|prior|older|past|last)\s+(?:chat|conversation|discussion)|\bwhat did (?:we|i) (?:talk|discuss|say) about|\bwhat (?:did i tell you|have i told you)\b|\bdo you remember (?:when|what|our)|\blook back (?:at|through) (?:our|the) (?:chat|conversation)|\bconversa(?:s|ção|ções)? anterior(?:es)?|\bconversamos sobre|\bfalamos sobre|\b(?:o que|qual|quais) (?:eu|a gente|nós) (?:falamos|conversamos|decidimos)|\b(?:já te contei|lembra quando|lembra o que|procura nas conversas|busca no histórico)\b/i.test(String(text||''));
}

export function historySearchTerms(text){
  const terms=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[];
  return [...new Set(terms.filter(term=>!HISTORY_STOP_WORDS.has(term)))].slice(-6);
}
