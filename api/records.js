import {createClient} from '@libsql/client/web';
import {migrate,saveRecord,findRecord,RequestError} from '../lib/records.mjs';
let db,ready;
function database(){if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN)throw new RequestError('Record storage unavailable',503);return db??=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');throw new RequestError('Method not allowed',405);}
    const conn=database();if(!ready)ready=migrate(conn).catch(e=>{ready=null;throw e;});await ready;
    if(req.method==='GET'){const id=new URL(req.url,'https://erosion-sector-editor.vercel.app').searchParams.get('id');return res.status(200).json(await findRecord(conn,id));}
    if(req.headers.origin&&req.headers.origin!=='https://erosion-sector-editor.vercel.app'&&!/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin))throw new RequestError('Origin not allowed',403);
    if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new RequestError('Use application/json',415);
    let body=req.body;if(typeof body==='string'){if(Buffer.byteLength(body)>16384)throw new RequestError('Record too large',413);try{body=JSON.parse(body);}catch{throw new RequestError('Invalid JSON');}}
    if(Buffer.byteLength(JSON.stringify(body??null))>16384)throw new RequestError('Record too large',413);
    const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
    const result=await saveRecord(conn,body,ip);return res.status(result.created?201:200).json({recordId:result.record.recordId,url:'https://erosion-sector-editor.vercel.app/records/?id='+result.record.recordId,artifactMatch:result.record.artifactMatch,trust:'self-reported'});
  }catch(error){if(!(error instanceof RequestError))console.error('Record operation failed:',error.name);return res.status(error instanceof RequestError?error.status:503).json({error:error instanceof RequestError?error.message:'Record storage temporarily unavailable'});}
}
