import { json } from './http.mjs';
import { getDatabase } from '@netlify/database';

// Token auth removed. Access is open until Netlify site password is configured.
export async function requireUser(req, requestId=null){
  const user={id:'zeus-personal-owner',email:null,name:'Felipe'};
  try{
    const db=getDatabase();
    await db.sql`INSERT INTO users(id,email,display_name) VALUES(${user.id},${user.email},${user.name}) ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=now()`;
    return {user,db};
  }catch(error){
    console.error('Database bootstrap failed',error?.message||error);
    return {error:json({error:'Zeus workspace database is temporarily unavailable.',code:'DATABASE_UNAVAILABLE',...(requestId?{requestId}:{})},503)};
  }
}
