// Gemini Live emits transcript fragments; keep a bounded utterance until turn completion.
export function createGeminiTranscriptAccumulator(onTurn,{maxChars=8000}={}){
 if(typeof onTurn!=='function')throw new TypeError('onTurn callback is required');
 const buffer={user:'',assistant:''};let sequence=0;
 const append=(role,fragment)=>{
  const value=typeof fragment==='string'?fragment:'';
  if(!value)return;
  const previous=buffer[role];
  buffer[role]=(previous.length>=4&&value.startsWith(previous)?value:previous.endsWith(value)?previous:previous+value).slice(0,maxChars);
 };
 const flush=()=>{
  for(const role of ['user','assistant']){
   const content=buffer[role].trim();buffer[role]='';
   if(content)onTurn({role,content,eventId:'gemini-'+role+'-'+(++sequence)});
  }
 };
 return Object.freeze({
  accept(serverContent){
   if(!serverContent||typeof serverContent!=='object')return;
   append('user',serverContent.inputTranscription?.text);
   append('assistant',serverContent.outputTranscription?.text);
   if(serverContent.turnComplete||serverContent.interrupted)flush();
  },
  flush,
 });
}
