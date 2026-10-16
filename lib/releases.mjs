import {readFile} from 'node:fs/promises';
import {createHash,createPublicKey,verify} from 'node:crypto';
import path from 'node:path';
const hash=data=>createHash('sha256').update(data).digest('hex');
export function verifyRelease(envelope,identity,version){
  if(!/^[0-9A-Za-z.+_-]{1,64}$/.test(version)||envelope.algorithm!=='Ed25519'||typeof envelope.payload!=='string'||envelope.payload.length>44000||typeof envelope.signature!=='string')throw Error('Invalid release envelope');
  const bytes=Buffer.from(envelope.payload,'base64'),signature=Buffer.from(envelope.signature,'base64');
  const der=Buffer.from(identity.publicKey,'base64');
  if(hash(der)!==identity.keyId||signature.length!==64||!verify(null,bytes,createPublicKey({key:der,format:'der',type:'spki'}),signature))throw Error('Invalid release signature');
  const m=JSON.parse(bytes.toString('utf8'));
  if(m.schema!=='erosionsector.release/1'||m.kind!=='mod'||m.modId!=='erosionsector'||m.version!==version||m.keyId!==identity.keyId||m.minecraft!=='1.21.1'||m.loader!=='neoforge'||m.filename!==`erosionsector-${version}.jar`||!Number.isSafeInteger(m.size)||m.size<=0||m.size>67108864||!/^[a-f0-9]{64}$/.test(m.sha256))throw Error('Release identity mismatch');
  return m;
}
export async function officialRelease(version){
  if(!/^[0-9A-Za-z.+_-]{1,64}$/.test(version))return null;
  try{
    const [raw,key]=await Promise.all([readFile(path.join(process.cwd(),'dist/releases/versions',version+'.json'),'utf8'),readFile(new URL('./trusted-key.json',import.meta.url),'utf8')]);
    return verifyRelease(JSON.parse(raw),JSON.parse(key),version);
  }catch(e){if(e.code==='ENOENT')return null;throw e;}
}
