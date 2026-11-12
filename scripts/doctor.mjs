import {pathToFileURL} from 'node:url';
export async function runDoctor({base,fetcher=fetch,json=false,log=console.log}={}) {
  const url=new URL(base||'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Use a site URL without credentials, query or fragment.');
  const response=await fetcher(new URL('/api/health',url),{redirect:'error',signal:AbortSignal.timeout(30000),headers:{Accept:'application/json'}});
  // Do not echo HTML/errors: upstream pages may contain credentials or personal data.
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error(`Doctor unavailable (HTTP ${response.status}); check site access and deployment.`);
  const data=await response.json();
  const d=data?.doctor;
  if(d?.version!==1||!Array.isArray(d.checks))throw new Error('Doctor is missing from this deploy.');
  if(json)log(JSON.stringify(d,null,2));
  else {log(`Zeus Proxy Doctor · ${d.status} · ${d.checkedAt}`);for(const c of d.checks)log(`${c.status.toUpperCase()} | ${c.label} | ${c.detail}`);}
  return d.status==='blocked'?1:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{process.exitCode=await runDoctor({base:process.env.ZEUS_PROXY_SMOKE_BASE_URL||process.env.OLYHUB_SMOKE_BASE_URL,json:process.argv.includes('--json')});}
  catch{console.error('Doctor could not complete. Set ZEUS_PROXY_SMOKE_BASE_URL to the exact accessible app URL and check its deployment/access.');process.exitCode=2;}
}
