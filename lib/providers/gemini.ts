import {GoogleGenAI} from '@google/genai';
import {zeusSystemPrompt} from '../core/identity';
import {resolveModelChain,runModelChain} from './model-fallback';
import type {ProviderAdapter} from './types';

const defaults=['gemini-3.1-pro-preview','gemini-2.5-pro','gemini-3-flash-preview','gemini-2.5-flash'];

export const geminiAdapter:ProviderAdapter={
  name:'gemini',
  async call(messages,signal){
    if(!process.env.GEMINI_API_KEY||!process.env.GOOGLE_GEMINI_BASE_URL)throw new Error('GEMINI_NOT_CONFIGURED');
    const models=resolveModelChain(process.env.GEMINI_MODEL,process.env.GEMINI_MODEL_CHAIN,defaults);
    const client=new GoogleGenAI({});
    const contents=messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
    const run=await runModelChain(models,signal,async model=>{
      const response=await client.models.generateContent({model,contents,config:{systemInstruction:zeusSystemPrompt(),abortSignal:signal} as any});
      const text=(response.text||'').trim();
      if(!text)throw new Error('EMPTY_PROVIDER_RESPONSE');
      const usage=(response as any).usageMetadata;
      return {
        text,
        model:(response as any).modelVersion||model,
        usage:usage?{inputTokens:usage.promptTokenCount,outputTokens:usage.candidatesTokenCount}:undefined,
        finishReason:(response as any).candidates?.[0]?.finishReason
      };
    });
    return {...run.value,modelAttempts:run.attempts};
  }
};
