import Anthropic from '@anthropic-ai/sdk';
import {zeusSystemPrompt} from '../core/identity';
import {resolveModelChain,runModelChain} from './model-fallback';
import type {ProviderAdapter} from './types';

const defaults=['claude-sonnet-5','claude-sonnet-4-6','claude-haiku-4-5'];

export const anthropicAdapter:ProviderAdapter={
  name:'claude',
  async call(messages,signal){
    if(!process.env.ANTHROPIC_API_KEY||!process.env.ANTHROPIC_BASE_URL)throw new Error('ANTHROPIC_NOT_CONFIGURED');
    const models=resolveModelChain(process.env.ANTHROPIC_MODEL,process.env.ANTHROPIC_MODEL_CHAIN,defaults);
    const client=new Anthropic();
    const run=await runModelChain(models,signal,async model=>{
      const response=await client.messages.create({model,max_tokens:2048,system:zeusSystemPrompt(),messages:messages as any},{signal});
      const text=response.content.filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n').trim();
      if(!text)throw new Error('EMPTY_PROVIDER_RESPONSE');
      return {
        text,
        model:(response as any).model||model,
        usage:{inputTokens:response.usage.input_tokens,outputTokens:response.usage.output_tokens},
        finishReason:response.stop_reason||undefined
      };
    });
    return {...run.value,modelAttempts:run.attempts};
  }
};
