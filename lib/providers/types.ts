import type {ChatMessage,ProviderName,Usage} from '../core/contracts';
export type ProviderResult={text:string;model:string;usage?:Usage;finishReason?:string;modelAttempts?:string[]};
export interface ProviderAdapter{name:ProviderName;call(messages:ChatMessage[],signal:AbortSignal):Promise<ProviderResult>}
