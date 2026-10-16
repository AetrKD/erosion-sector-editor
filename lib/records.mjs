import {createHash} from 'node:crypto';
import {officialRelease} from './releases.mjs';
export const digest=value=>createHash('sha256').update(value).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class RequestError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const text=(value,name,max=160)=>{if(typeof value!=='string'||value.length<1||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw new RequestError('Invalid '+name);return value;};
const integer=(value,name,min,max)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new RequestError('Invalid '+name);return value;};
export function normalizeRecord(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!uuid.test(raw.recordId))throw new RequestError('Invalid recordId');
  if(typeof raw.success!=='boolean')throw new RequestError('Invalid result');
  const finished=Date.parse(raw.finishedAt);if(!Number.isFinite(finished)||finished>Date.now()+300000||finished<Date.now()-366*86400000)throw new RequestError('Invalid finish time');
  const i=raw.integrity;if(!i||typeof i!=='object'||!['verified','verified_cached','pending','unchecked','unavailable','invalid_signature','modified','development'].includes(i.status)||!/^([a-f0-9]{64})?$/.test(i.sha256)||!/^([a-f0-9]{64})?$/.test(i.keyId)||!/^([0-9A-Za-z.+_-]{1,64})?$/.test(i.version))throw new RequestError('Invalid integrity evidence');
  return {recordId:raw.recordId.toLowerCase(),stageId:text(raw.stageId,'stage ID'),stageName:text(raw.stageName,'stage name'),success:raw.success,finishedAt:new Date(finished).toISOString(),completedObjectives:integer(raw.completedObjectives,'objectives',0,10000),durationMs:integer(raw.durationMs,'duration',0,604800000),partySize:integer(raw.partySize,'party size',1,16),integrity:{status:i.status,version:i.version,sha256:i.sha256,keyId:i.keyId,artifactVerifiedLocally:i.artifactVerifiedLocally===true,runtimeAttested:false}};
}
export async function migrate(db){await db.batch([
  'CREATE TABLE IF NOT EXISTS es_records (id TEXT PRIMARY KEY, body_hash TEXT NOT NULL, body TEXT NOT NULL, artifact_match INTEGER NOT NULL, received_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS es_records_received ON es_records(received_at)',
  'CREATE TABLE IF NOT EXISTS es_record_limits (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL)'
],'write');}
function expose(row){return {...JSON.parse(row.body),artifactMatch:!!row.artifact_match,trust:'self-reported',receivedAt:row.received_at};}
export async function findRecord(db,id){if(typeof id!=='string'||!uuid.test(id))throw new RequestError('Invalid record ID');const r=await db.execute({sql:'SELECT * FROM es_records WHERE id = ?',args:[id.toLowerCase()]});if(!r.rows.length)throw new RequestError('Record not found',404);return expose(r.rows[0]);}
export async function saveRecord(db,raw,ip,{lookup=officialRelease,limit=12}={}){
  const record=normalizeRecord(raw),body=JSON.stringify(record),bodyHash=digest(body);
  const existing=await db.execute({sql:'SELECT * FROM es_records WHERE id = ?',args:[record.recordId]});
  if(existing.rows.length){if(existing.rows[0].body_hash!==bodyHash)throw new RequestError('Record ID already used',409);return {created:false,record:expose(existing.rows[0])};}
  const now=Date.now(),bucket=digest('es-records:'+ip)+':'+Math.floor(now/3600000);
  const throttle=await db.execute({sql:'INSERT INTO es_record_limits(bucket,hits,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits',args:[bucket,now+7200000]});
  if(Number(throttle.rows[0].hits)>limit)throw new RequestError('Upload limit reached; keep the local result and retry later',429);
  if(Number(throttle.rows[0].hits)===1)await db.execute({sql:'DELETE FROM es_record_limits WHERE expires_at < ?',args:[now]});
  const release=await lookup(record.integrity.version);
  const match=!!release&&record.integrity.sha256===release.sha256&&record.integrity.keyId===release.keyId;
  const receipt=new Date().toISOString();
  const inserted=await db.execute({sql:'INSERT OR IGNORE INTO es_records(id,body_hash,body,artifact_match,received_at) VALUES (?,?,?,?,?)',args:[record.recordId,bodyHash,body,match?1:0,receipt]});
  const saved=await db.execute({sql:'SELECT * FROM es_records WHERE id = ?',args:[record.recordId]});
  if(saved.rows[0].body_hash!==bodyHash)throw new RequestError('Record ID already used',409);
  return {created:inserted.rowsAffected===1,record:expose(saved.rows[0])};
}
