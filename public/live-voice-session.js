// Browser Live Talk contract: transport details stay in provider drivers.
export const LIVE_VOICE_PROVIDER_IDS=Object.freeze(['elevenlabs','gemini','openai']);
export function createLiveVoiceSessionBridge({getProvider,drivers}){
 if(typeof getProvider!=='function'||!drivers||typeof drivers!=='object')throw new TypeError('Invalid Live Talk session configuration.');
 for(const id of LIVE_VOICE_PROVIDER_IDS){
  const d=drivers[id];
  if(!d||typeof d.connect!=='function'||typeof d.close!=='function'||typeof d.isConnected!=='function'||typeof d.setMuted!=='function')throw new TypeError('Incomplete Live Talk driver: '+id);
 }
 const active=()=>{const id=getProvider();if(!LIVE_VOICE_PROVIDER_IDS.includes(id))throw new Error('Unsupported Live Talk provider: '+String(id));return drivers[id];};
 return Object.freeze({
  connect:()=>active().connect(),
  isConnected:()=>Boolean(active().isConnected()),
  async setMuted(muted){const d=active();if(!d.isConnected())throw new Error('Live Talk is not connected. Reconnect before changing microphone state.');await d.setMuted(Boolean(muted));},
  updateContext:context=>{const d=active();if(!d.isConnected()||typeof d.updateContext!=='function')return false;d.updateContext(String(context||''));return true;},
  sendText:text=>{const d=active();if(!d.isConnected()||typeof d.sendText!=='function')return false;return d.sendText(String(text||''))===true;},
  notifyActivity:()=>{const d=active();if(d.isConnected())d.notifyActivity?.();},
  // Also closes transports that were only partially initialized.
  async closeAll(){
   const pending=LIVE_VOICE_PROVIDER_IDS.map(id=>{try{return Promise.resolve(drivers[id].close());}catch(error){return Promise.reject(error);}});
   await Promise.allSettled(pending);
  },
 });
}
