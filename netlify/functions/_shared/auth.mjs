import { json } from './http.mjs';

export async function requireUser(_req, requestId=null, databaseFactory=null){
  // Zeus Proxy is intentionally a single-owner personal workspace. It does not
  // require a second shared token; protect the site itself with Netlify access
  // controls if it must not be reachable by the public.
  const user={id:'zeus-personal-owner',email:null,name:'Felipe'};
  try{
    const getDatabase=databaseFactory||(await import('@netlify/database')).getDatabase;
    const db=getDatabase();
    await db.sql`INSERT INTO users(id,email,display_name) VALUES(${user.id},${user.email},${user.name}) ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=now()`;
    return {user,db};
  }catch(error){
    return {error:json({error:'Zeus workspace database is temporarily unavailable.',code:'DATABASE_UNAVAILABLE',...(requestId?{requestId}:{})},503)};
  }
}
