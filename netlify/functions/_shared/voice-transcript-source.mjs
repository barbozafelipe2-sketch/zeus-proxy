// Validate provider labels before storing voice transcript metadata.
export const LIVE_VOICE_TRANSCRIPT_SOURCES=Object.freeze({
 elevenlabs:'elevenlabs_realtime',
 gemini:'gemini_live',
 openai:'openai_realtime',
});
export function resolveVoiceTranscriptProvider(value){
 const provider=value==null?'elevenlabs':String(value).trim().toLowerCase();
 if(!Object.hasOwn(LIVE_VOICE_TRANSCRIPT_SOURCES,provider))
  throw Object.assign(new Error('Unsupported realtime transcript provider.'),{status:400,code:'VOICE_TRANSCRIPT_PROVIDER_INVALID'});
 return {provider,source:LIVE_VOICE_TRANSCRIPT_SOURCES[provider]};
}
