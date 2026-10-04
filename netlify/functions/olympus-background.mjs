import { runChatRequest } from './chat.mjs';

// Filename suffix `-background` makes Netlify return 202 immediately and keep this
// invocation alive past the 60s synchronous limit. The real Olympus work runs here.
export default async (req, context) => {
  const headers = new Headers(req.headers);
  headers.set('x-olympus-execute', '1');
  const body = await req.text();
  const forwarded = new Request(req.url, { method: 'POST', headers, body });
  try {
    await runChatRequest(forwarded, context || {});
  } catch (error) {
    console.error('Olympus background failed', error?.stack || error?.message || error);
  }
};

export const config = { path: '/api/olympus-background' };
