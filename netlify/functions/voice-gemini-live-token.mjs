import {voiceRealtimeHandler} from './_shared/voice-realtime.mjs';
export default (req,context)=>voiceRealtimeHandler(req,context,'token','gemini');
export const config={path:'/api/voice/gemini-live-token'};
