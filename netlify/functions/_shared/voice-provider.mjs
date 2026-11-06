// Voice transport contract. Do not expose vendor API keys to the browser.
// Additional providers must implement the same short-lived credential interface
// before they can be enabled; a transcription-only API is not a Live Talk transport.
import {createElevenLabsRealtimeConversationToken,createElevenLabsRealtimeSignedUrl} from './elevenlabs-agent.mjs';

export const DEFAULT_LIVE_VOICE_PROVIDER='elevenlabs';
export const LIVE_VOICE_PROVIDERS=Object.freeze({
 elevenlabs:Object.freeze({id:'elevenlabs',realtimeConversation:true,transports:['token','signed']}),
 muse:Object.freeze({id:'muse',realtimeConversation:false,transports:[]})
});

export function resolveLiveVoiceProvider(requested){
 const provider=requested==null?DEFAULT_LIVE_VOICE_PROVIDER:String(requested).trim().toLowerCase();
 if(!Object.hasOwn(LIVE_VOICE_PROVIDERS,provider))throw Object.assign(new Error('Unknown Live Talk provider.'),{status:400,code:'VOICE_PROVIDER_UNKNOWN'});
 if(!LIVE_VOICE_PROVIDERS[provider].realtimeConversation)throw Object.assign(new Error('This provider does not have a configured realtime conversation transport.'),{status:501,code:'VOICE_PROVIDER_UNAVAILABLE'});
 return provider;
}

export async function issueLiveVoiceCredentials({provider,agent,kind}){
 const selected=resolveLiveVoiceProvider(provider);
 if(kind!=='token'&&kind!=='signed')throw Object.assign(new Error('Unsupported realtime transport.'),{status:400,code:'VOICE_TRANSPORT_UNSUPPORTED'});
 if(selected==='elevenlabs')return kind==='signed'?createElevenLabsRealtimeSignedUrl({agent}):createElevenLabsRealtimeConversationToken({agent});
 throw Object.assign(new Error('Realtime transport not configured.'),{status:501,code:'VOICE_PROVIDER_UNAVAILABLE'});
}
