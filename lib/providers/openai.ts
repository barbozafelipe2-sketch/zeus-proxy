import OpenAI from 'openai';
import {zeusSystemPrompt} from '../core/identity';
import {resolveModelChain,runModelChain} from './model-fallback';
import type {ProviderAdapter} from './types';

const defaults=['gpt-6.1-sol','gpt-6-sol','gpt-5.6-sol','gpt-5.6-terra','gpt-6-luna'];

export const openaiAdapter:ProviderAdapter={
  name:'openai',
  async call(messages,signal){
    if(!process.env.OPENAI_API_KEY||!process.env.OPENAI_BASE_URL)throw new Error('OPENAI_NOT_CONFIGURED');
    const models=resolveModelChain(process.env.OPENAI_MODEL,process.env.OPENAI_MODEL_CHAIN,defaults);
    const client=new OpenAI();
    const input:any[]=[{role:'system',content:zeusSystemPrompt()},...messages];
    const run=await runModelChain(models,signal,async model=>{
      const response=await client.chat.completions.create({model,messages:input,max_completion_tokens:2048},{signal});
      const text=response.choices[0]?.message?.content?.trim()||'';
      if(!text)throw new Error('EMPTY_PROVIDER_RESPONSE');
      return {
        text,
        model:response.model||model,
        usage:{inputTokens:response.usage?.prompt_tokens,outputTokens:response.usage?.completion_tokens},
        finishReason:response.choices[0]?.finish_reason||undefined
      };
    });
    return {...run.value,modelAttempts:run.attempts};
  }
};
