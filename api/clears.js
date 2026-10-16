import {createClient} from '@libsql/client/web';
import {migrateProgress,listClears,saveClear,ProgressError} from '../lib/clears.mjs';
let db,ready;
function database(){if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN)throw new ProgressError('Progress storage unavailable',503);return db??=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');throw new ProgressError('Method not allowed',405);}
    const conn=database();if(!ready)ready=migrateProgress(conn).catch(e=>{ready=null;throw e;});await ready;
    if(req.method==='GET'){const url=new URL(req.url,'https://erosion-sector-editor.vercel.app');return res.status(200).json(await listClears(conn,url.searchParams.get('playerId'),url.searchParams.get('after')??''));}
    if(req.headers.origin&&req.headers.origin!=='https://erosion-sector-editor.vercel.app'&&!/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin))throw new ProgressError('Origin not allowed',403);
    if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new ProgressError('Use application/json',415);
    let body=req.body;if(typeof body==='string'){if(Buffer.byteLength(body)>16384)throw new ProgressError('Payload too large',413);try{body=JSON.parse(body);}catch{throw new ProgressError('Invalid JSON');}}
    if(Buffer.byteLength(JSON.stringify(body??null))>16384)throw new ProgressError('Payload too large',413);
    const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();return res.status(200).json(await saveClear(conn,body,ip));
  }catch(error){if(!(error instanceof ProgressError))console.error('Clear progress operation failed:',error.name);return res.status(error instanceof ProgressError?error.status:503).json({error:error instanceof ProgressError?error.message:'Progress storage temporarily unavailable'});}
}
