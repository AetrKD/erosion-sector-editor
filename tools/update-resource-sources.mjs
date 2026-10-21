/** Pin official download locations to the exact block-adding JARs in a local instance. Never copies third-party assets into dist. */
import {readFile,writeFile,readdir} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {unzipSync} from 'fflate';
const workspace=path.resolve(process.argv[2]||'..'),modDir=path.join(workspace,'minecraft/mods');
const digest=(bytes,algorithm)=>createHash(algorithm).update(bytes).digest('hex');
const request=async url=>{const r=await fetch(url,{headers:{'User-Agent':'ErosionSectorEditor/resource-catalogue'}});if(!r.ok)throw Error('Official catalogue request failed: '+r.status);return r.json();};
const manifest=await request('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'),metadata=await request(manifest.versions.find(v=>v.id==='1.21.1').url),client=metadata.downloads.client;
const vanillaPath=process.argv[3]||path.join(process.env.APPDATA,'PrismLauncher/libraries/com/mojang/minecraft/1.21.1/minecraft-1.21.1-client.jar'),vanilla=await readFile(vanillaPath);if(digest(vanilla,'sha1')!==client.sha1)throw Error('Installed Minecraft does not match official 1.21.1 client');
const sources=[{id:'minecraft',file:path.basename(vanillaPath),label:'Minecraft 1.21.1',version:'1.21.1',url:client.url,sha256:digest(vanilla,'sha256'),size:vanilla.length,namespaces:['minecraft'],dependsOn:[]}];
for(const file of (await readdir(modDir)).filter(f=>f.endsWith('.jar')).sort()){
 const bytes=await readFile(path.join(modDir,file)),namespaces=new Set();unzipSync(bytes,{filter:f=>{const m=/^assets\/([^/]+)\/blockstates\/.*\.json$/.exec(f.name);if(m)namespaces.add(m[1]);return false;}});namespaces.delete('erosionsector');if(!namespaces.size)continue;
 const sha512=digest(bytes,'sha512'),version=await request('https://api.modrinth.com/v2/version_file/'+sha512+'?algorithm=sha512'),source=version.files.find(f=>f.hashes.sha512===sha512);if(!source)throw Error('Exact installed version not available from official distribution: '+file);
 const names=[...namespaces].sort(),labels={create:'Create',copycats:'Copycats+',createdeco:'Create Deco',tacz:'TaCZ',sable_player_ragdoll:'Sable Player Ragdoll'};sources.push({id:version.project_id,file,label:(labels[names[0]]||names[0])+' '+version.version_number,version:version.version_number,url:source.url,sha256:digest(bytes,'sha256'),size:bytes.length,namespaces:names,dependsOn:['minecraft']});
}
const create=sources.find(s=>s.namespaces.includes('create'));for(const s of sources)if(s.namespaces.some(ns=>['copycats','createdeco'].includes(ns))&&create)s.dependsOn.push(create.id);
await writeFile(new URL('../dist/block-resources/sources.json',import.meta.url),JSON.stringify({version:1,sources},null,2)+'\n');console.log('Pinned '+sources.length+' official sources; no external assets copied.');
