const HISTORY_STOP_WORDS=new Set('about after again and antes aqui are as at com como conversa conversas could did do dos das ela ele em eu for from have how in into is isso it me my na no nos o of on or our para por que sobre the this to we what when where which who with you your previously anterior passadas falamos'.split(' '));

// Only a command at the start of the message can create a durable memory.
// Questions and incidental uses of "remember"/"guarde" remain ordinary chat.
const COMMAND_LEAD='(?:(?:hey\\s+)?zeus[,:]?\\s+)?(?:(?:please|por favor|pf)[,]?\\s+)?';
const QUESTION_WORDS='(?:when|what|where|how|why|who|which|if|whether|quando|o\\s+que|qual|quais|onde|como|por\\s+que|porque|quem|se)\\b';
const MEMORY_COMMANDS=[
  '(?:remember|keep\\s+in\\s+mind|memorize)(?:\\s+(?:that|this|to))?[\\s,:;-]+',
  'save\\s+this\\s+(?:to|in|into)\\s+(?:my\\s+|your\\s+|the\\s+)?memory[\\s,:;-]*',
  'save\\s+this[:;-]\\s*',
  '(?:lembre-se|lembre|lembra)(?:\\s+(?:que|de|disso|isso|isto))?[\\s,:;-]+',
  'memorize(?:\\s+(?:que|isso|isto))?[\\s,:;-]+',
  'guarde\\s+(?:que|isso|isto)(?:\\s+(?:na|em)\\s+(?:minha\\s+|sua\\s+)?mem[oó]ria)?[\\s,:;-]+',
  'guarde\\s+(?:na|em)\\s+(?:minha\\s+|sua\\s+)?mem[oó]ria[\\s,:;-]*',
  'salve(?:\\s+(?:isso|isto))?\\s+(?:na|em)\\s+(?:minha\\s+|sua\\s+)?mem[oó]ria[\\s,:;-]*',
  'mantenha(?:\\s+isso|\\s+isto)?\\s+em\\s+mente[\\s,:;-]*',
];
const COMMAND_RE=new RegExp(`^\\s*${COMMAND_LEAD}(?:${MEMORY_COMMANDS.join('|')})`,'i');
const QUESTION_RE=new RegExp(`^\\s*${COMMAND_LEAD}(?:remember|keep\\s+in\\s+mind|lembre-se|lembre|lembra)\\s+(?:(?:that|this|que|de|disso|isso|isto)\\s+)?${QUESTION_WORDS}`,'i');

export function memoryContentFromRequest(text){
  const value=String(text||'');
  const match=COMMAND_RE.exec(value);
  return (match?value.slice(match[0].length):value).trim();
}

export function explicitMemoryIntent(text){
  const value=String(text||'').trim();
  if(!value||value.length>4000||QUESTION_RE.test(value))return false;
  const match=COMMAND_RE.exec(value);
  if(!match)return false;
  const content=value.slice(match[0].length).trim();
  return content.length>=3&&!/\?\s*$/.test(content);
}

export function explicitHistoryIntent(text){
  return /\b(previous|prior|older|past|last)\s+(?:chat|conversation|discussion)|\bwhat did (?:we|i) (?:talk|discuss|say) about|\bwhat (?:did i tell you|have i told you)\b|\bdo you remember (?:when|what|our)|\blook back (?:at|through) (?:our|the) (?:chat|conversation)|\bconversa(?:s|ção|ções)? anterior(?:es)?|\bconversamos sobre|\bfalamos sobre|\b(?:o que|qual|quais) (?:eu|a gente|nós) (?:falamos|conversamos|decidimos)|\b(?:já te contei|lembra quando|lembra o que|procura nas conversas|busca no histórico)\b/i.test(String(text||''));
}

export function historySearchTerms(text){
  const terms=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[];
  return [...new Set(terms.filter(term=>!HISTORY_STOP_WORDS.has(term)))].slice(-6);
}
