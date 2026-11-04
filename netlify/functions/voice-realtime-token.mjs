import {voiceRealtimeHandler} from './_shared/voice-realtime.mjs';
export default (req,context)=>voiceRealtimeHandler(req,context,'token');
export const config={path:'/api/voice/realtime-token'};
