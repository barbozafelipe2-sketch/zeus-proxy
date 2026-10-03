import { getStore, getDeployStore } from '@netlify/blobs';

export function blobStore(name = 'olyhub-files') {
  const context = globalThis.Netlify?.context?.deploy?.context;
  return context === 'production' ? getStore(name, { consistency: 'strong' }) : getDeployStore(name);
}
