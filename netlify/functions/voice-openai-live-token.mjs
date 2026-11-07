import {voiceRealtimeHandler} from './_shared/voice-realtime.mjs';
export default (req,context)=>voiceRealtimeHandler(req,context,'token','openai');
export const config={path:'/api/voice/openai-live-token'};
