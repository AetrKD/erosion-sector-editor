import {createHash} from 'node:crypto';
export class ProgressError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function playerId(value){if(typeof value!=='string'||!uuid.test(value))throw new ProgressError('Invalid player ID');return value.toLowerCase();}
function text(value,name,max,empty=false){if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw new ProgressError('Invalid '+name);return value;}
export function normalizeClear(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['stageId','stageName','chapter','missionCode','clearedAt','players'].includes(k)))throw new ProgressError('Only stage clear progress is accepted');
  if(!Array.isArray(raw.players)||raw.players.length<1||raw.players.length>16)throw new ProgressError('Invalid participants');
  const cleared=Date.parse(raw.clearedAt);if(!Number.isFinite(cleared)||cleared>Date.now()+300000||cleared<0)throw new ProgressError('Invalid clear time');
  return {stageId:text(raw.stageId,'stage ID',160),stageName:text(raw.stageName,'stage name',96),chapter:text(raw.chapter??'','chapter',64,true),missionCode:text(raw.missionCode??'','mission code',64,true),clearedAt:new Date(cleared).toISOString(),players:[...new Set(raw.players.map(playerId))]};
}
export async function migrateProgress(db){await db.batch([
  'CREATE TABLE IF NOT EXISTS es_clears (player_id TEXT NOT NULL, stage_id TEXT NOT NULL, stage_name TEXT NOT NULL, chapter TEXT NOT NULL, mission_code TEXT NOT NULL, cleared_at TEXT NOT NULL, PRIMARY KEY(player_id,stage_id))',
  'CREATE TABLE IF NOT EXISTS es_clear_limits (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL)'
],'write');}
export async function saveClear(db,raw,ip,{limit=120}={}){
  const clear=normalizeClear(raw),now=Date.now(),bucket=createHash('sha256').update('es-clears:'+ip).digest('hex')+':'+Math.floor(now/3600000);
  const throttle=await db.execute({sql:'INSERT INTO es_clear_limits(bucket,hits,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits',args:[bucket,now+7200000]});
  if(Number(throttle.rows[0].hits)>limit)throw new ProgressError('Cloud sync limit reached; retry later',429);
  if(Number(throttle.rows[0].hits)===1)await db.execute({sql:'DELETE FROM es_clear_limits WHERE expires_at < ?',args:[now]});
  await db.batch(clear.players.map(id=>({sql:'INSERT INTO es_clears(player_id,stage_id,stage_name,chapter,mission_code,cleared_at) VALUES (?,?,?,?,?,?) ON CONFLICT(player_id,stage_id) DO UPDATE SET stage_name=excluded.stage_name,chapter=excluded.chapter,mission_code=excluded.mission_code,cleared_at=excluded.cleared_at WHERE excluded.cleared_at < es_clears.cleared_at',args:[id,clear.stageId,clear.stageName,clear.chapter,clear.missionCode,clear.clearedAt]})),'write');
  return {stageId:clear.stageId,players:clear.players,saved:true};
}
export async function listClears(db,rawId,after=''){
  const id=playerId(rawId);text(after,'cursor',160,true);
  const [rows,count]=await Promise.all([db.execute({sql:'SELECT stage_id,stage_name,chapter,mission_code,cleared_at FROM es_clears WHERE player_id=? AND stage_id>? ORDER BY stage_id LIMIT 101',args:[id,after]}),db.execute({sql:'SELECT COUNT(*) AS total FROM es_clears WHERE player_id=?',args:[id]})]);
  return {playerId:id,total:Number(count.rows[0].total),clears:rows.rows.slice(0,100).map(r=>({stageId:r.stage_id,stageName:r.stage_name,chapter:r.chapter,missionCode:r.mission_code,clearedAt:r.cleared_at})),nextCursor:rows.rows.length>100?rows.rows[99].stage_id:null};
}
