import {describe,it,expect} from 'vitest';
import {checkPrivateAccess} from '../lib/core/access';
import {transition,finish} from '../lib/core/execution';
import {route} from '../lib/core/router';
import {ChatRequestSchema,type Trace} from '../lib/core/contracts';
import {errorCode,httpStatus} from '../lib/core/errors';
import {callWithOpenAIFallback,runOlympus,chooseZeusProvider} from '../lib/core/orchestration';
import {resolveModelChain,runModelChain,shouldTryNextModel} from '../lib/providers/model-fallback';

const base=():Trace=>({traceId:crypto.randomUUID(),requestId:crypto.randomUUID(),projectId:'default',conversationId:crypto.randomUUID(),mode:'zeus',startedAt:new Date().toISOString(),latencyMs:0,status:'RECEIVED',retryCount:0});

describe('state machine',()=>{
  it('allows legal path',()=>{let t=base();t=transition(t,'ROUTING');t=transition(t,'MODEL_RUNNING');t=transition(t,'PERSISTING');expect(finish(t,'COMPLETED').status).toBe('COMPLETED')});
  it('rejects illegal intermediate transition',()=>expect(()=>transition(base(),'COMPLETED')).toThrow(/INVALID_STATE_TRANSITION/));
  it('finish cannot bypass transition rules',()=>expect(()=>finish(base(),'COMPLETED')).toThrow(/INVALID_STATE_TRANSITION/));
});

describe('routing and validation',()=>{
  it('keeps direct provider routing internal while public request modes are Zeus or Olympus',()=>{
    expect(route('claude')).toBe('claude');
    expect(route('gemini')).toBe('gemini');
    expect(()=>ChatRequestSchema.parse({requestId:crypto.randomUUID(),message:'hi',mode:'openai'})).toThrow();
    expect(ChatRequestSchema.parse({requestId:crypto.randomUUID(),message:'hi',mode:'zeus'}).mode).toBe('zeus');
  });
  it('requires UUID requestId, accepts bounded text attachments, and rejects unsupported files',()=>{
    expect(()=>ChatRequestSchema.parse({requestId:'bad',message:'hi'})).toThrow();
    const parsed=ChatRequestSchema.parse({requestId:crypto.randomUUID(),message:'hi',attachments:[{id:'1',name:'notes.txt',mimeType:'text/plain',text:'hello',trust:'trusted'}]});
    expect((parsed.attachments[0] as any).trust).toBeUndefined();
    expect(()=>ChatRequestSchema.parse({requestId:crypto.randomUUID(),message:'hi',attachments:[{id:'1',name:'thing.pdf',mimeType:'application/pdf',text:'x'}]})).toThrow();
    expect(()=>ChatRequestSchema.parse({requestId:crypto.randomUUID(),message:'hi',attachments:[{id:'1',name:'large.txt',mimeType:'text/plain',text:'x'.repeat(50001)}]})).toThrow();
  });
  it('uses only provider configuration carrying a Netlify gateway base URL',()=>{
    expect(chooseZeusProvider({ANTHROPIC_API_KEY:'x'})).toBe('openai');
    expect(chooseZeusProvider({ANTHROPIC_API_KEY:'x',ANTHROPIC_BASE_URL:'https://gateway.test'})).toBe('claude');
    expect(chooseZeusProvider({GEMINI_API_KEY:'x',GOOGLE_GEMINI_BASE_URL:'https://gateway.test'})).toBe('gemini');
    expect(chooseZeusProvider({})).toBe('openai');
  });
});

describe('model fallback',()=>{
  it('uses an explicit chain exactly and otherwise appends safe defaults',()=>{
    expect(resolveModelChain('primary',undefined,['primary','backup'])).toEqual(['primary','backup']);
    expect(resolveModelChain('ignored','a,b,a',['c'])).toEqual(['a','b']);
  });
  it('moves to the next model on model unavailability',async()=>{
    const calls:string[]=[];
    const run=await runModelChain(['m1','m2'],new AbortController().signal,async model=>{
      calls.push(model);
      if(model==='m1')throw Object.assign(new Error('model unavailable'),{status:404});
      return model;
    });
    expect(run.value).toBe('m2');
    expect(run.attempts).toEqual(['m1','m2']);
    expect(calls).toEqual(['m1','m2']);
  });
  it('does not burn another model on auth, rate-limit, or generic bad request errors',()=>{
    expect(shouldTryNextModel(Object.assign(new Error('auth'),{status:401}))).toBe(false);
    expect(shouldTryNextModel(Object.assign(new Error('rate'),{status:429}))).toBe(false);
    expect(shouldTryNextModel(Object.assign(new Error('bad request'),{status:400}))).toBe(false);
  });
});

describe('provider fallback and Olympus council',()=>{
  it('falls back to the OpenAI provider chain after a selected provider fails',async()=>{
    const signal=new AbortController().signal;
    const call=async(provider:any)=>{if(provider==='claude')throw new Error('provider unavailable');return {text:'recovered',model:'gpt',modelAttempts:['gpt-a','gpt-b'],usage:{outputTokens:2}}};
    const result=await callWithOpenAIFallback('claude',[],signal,call as any,{ANTHROPIC_API_KEY:'a',ANTHROPIC_BASE_URL:'https://gateway.test',OPENAI_API_KEY:'o',OPENAI_BASE_URL:'https://gateway.test'});
    expect(result.provider).toBe('openai');
    expect(result.fallback?.from).toBe('claude');
    expect(result.result.modelAttempts).toEqual(['gpt-a','gpt-b']);
  });
  it('does not switch OpenAI to another provider when OpenAI itself fails',async()=>{
    const calls:string[]=[];
    const call=async(provider:any)=>{calls.push(provider);throw new Error('openai failed')};
    await expect(callWithOpenAIFallback('openai',[],new AbortController().signal,call as any,{OPENAI_API_KEY:'o',OPENAI_BASE_URL:'https://gateway.test',ANTHROPIC_API_KEY:'a',ANTHROPIC_BASE_URL:'https://gateway.test'})).rejects.toThrow('openai failed');
    expect(calls).toEqual(['openai']);
  });
  it('runs lead, blind reviewer, and director, recording unavailable reviewers',async()=>{
    const signal=new AbortController().signal;
    const calls:string[]=[];
    const call=async(provider:any,messages:any[])=>{calls.push(provider+':'+messages.at(-1)?.content);return {text:provider==='openai'?'final':'review',model:provider+'-model',modelAttempts:[provider+'-model']}};
    const result=await runOlympus([{role:'user',content:'Plan my week'}],signal,call as any,{OPENAI_API_KEY:'o',OPENAI_BASE_URL:'https://gateway.test',ANTHROPIC_API_KEY:'a',ANTHROPIC_BASE_URL:'https://gateway.test'});
    expect(result.result.text).toBe('final');
    expect(result.lead).toBe('openai');
    expect(result.director).toBe('openai');
    expect(result.degraded).toBe(true);
    expect(result.reviewers).toEqual(expect.arrayContaining([expect.objectContaining({provider:'claude',status:'completed'}),expect.objectContaining({provider:'gemini',status:'unavailable'})]));
    expect(calls.some(x=>x.startsWith('claude:'))).toBe(true);
  });
});

describe('error taxonomy',()=>{
  it('maps timeout, model availability, bad requests, rate limit and auth separately',()=>{
    expect(errorCode(new Error('MODEL_TIMEOUT'))).toBe('MODEL_TIMEOUT');
    expect(httpStatus('MODEL_TIMEOUT')).toBe(504);
    expect(errorCode(Object.assign(new Error('model missing'),{status:404}))).toBe('PROVIDER_MODEL_UNAVAILABLE');
    expect(errorCode(Object.assign(new Error('rate limit'),{status:429}))).toBe('PROVIDER_RATE_LIMITED');
    expect(errorCode(Object.assign(new Error('bad'),{status:401}))).toBe('PROVIDER_AUTH_FAILED');
    expect(errorCode(Object.assign(new Error('bad request'),{status:400}))).toBe('PROVIDER_BAD_REQUEST');
  });
});

describe('personal access gate',()=>{
  const secret='a'.repeat(40);
  it('fails closed in production without a configured token',()=>expect(checkPrivateAccess(undefined,null,true)).toBe('not_configured'));
  it('keeps local development usable without a token',()=>expect(checkPrivateAccess(undefined,null,false)).toBe('allowed'));
  it('requires a strong token and checks supplied credentials',()=>{
    expect(checkPrivateAccess('short','short',true)).toBe('not_configured');
    expect(checkPrivateAccess(secret,'wrong',true)).toBe('invalid');
    expect(checkPrivateAccess(secret,secret,true)).toBe('allowed');
  });
});
