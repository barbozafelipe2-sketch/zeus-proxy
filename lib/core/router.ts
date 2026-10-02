import type {ProviderName} from './contracts';
export function route(mode:string):ProviderName {
  if(mode==='openai'||mode==='claude'||mode==='gemini') return mode;
  // OH-001 invariant: Zeus is deterministic. Evidence-based routing belongs to OH-002.
  return 'openai';
}
