import type {ChatMessage,ProviderName} from '../core/contracts'; import type {ProviderAdapter,ProviderResult} from './types';
import {openaiAdapter} from './openai'; import {anthropicAdapter} from './anthropic'; import {geminiAdapter} from './gemini';
const adapters:Record<ProviderName,ProviderAdapter>={openai:openaiAdapter,claude:anthropicAdapter,gemini:geminiAdapter};
export function getProvider(provider:ProviderName){return adapters[provider];}
export async function callProvider(provider:ProviderName,messages:ChatMessage[],signal:AbortSignal):Promise<ProviderResult>{return getProvider(provider).call(messages,signal);}
