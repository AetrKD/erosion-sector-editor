import {occupancy,conflictingBlock} from './occupancy.mjs';
// Stored X/Z coordinates retain the 16-block view unit; placement snaps to 1/16 of it.
export const CELL = Object.freeze({x:16,y:8,z:16});
export const TILE_RULES=Object.freeze({horizontalStep:1,heightStep:8,minDoors:1,placementPolicy:'non-air-only'});
const horizontal=value=>Number.isInteger(value*16)&&Math.abs(value)<=1024;
export const FACES = ['north','east','south','west'];
export const OPPOSITE = {north:'south',south:'north',east:'west',west:'east'};
export const KINDS = {
  spawn:{label:'시작점',icon:'↗',color:'#9be2bd'},
  terminal:{label:'목표 단말기',icon:'⌘',color:'#80c7ff'},
  alarm:{label:'경보 장치',icon:'!',color:'#f4b875'},
  wave:{label:'적 출현',icon:'◆',color:'#ed8e93'},
  supply:{label:'보급 지점',icon:'+',color:'#bcb2f5'},
  extraction:{label:'탈출 지점',icon:'↪',color:'#9be2bd'},
  trigger:{label:'진입 트리거',icon:'◎',color:'#f4d67b'}
};
export const uid = prefix => prefix + '_' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
export const clone = value => structuredClone(value);
// Always relative to tile/: the set directory is part of the identity.
export function tileReference(value){
  return typeof value==='string'&&value.length<=512&&value.split('/').length>=2&&/\.nbt$/i.test(value)&&
    value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[\\<>:"|?*\u0000-\u001f]/.test(part));
}
export function tileOf(project, placement) { return project.tiles.find(t=>t.id===placement.tileId); }
export function dimensions(tile, rotation=0) {
  return rotation % 180 === 0 ? {...tile.size} : {x:tile.size.z,y:tile.size.y,z:tile.size.x};
}
export function bounds(tile, placement) {
  const size = dimensions(tile, placement.rotation);
  return {x:placement.x*16,y:placement.y*8,z:placement.z*16,...Object.fromEntries(Object.entries(size).map(([k,v])=>['d'+k,v]))};
}
export function overlaps(a,b) {
  return a.x < b.x+b.dx && a.x+a.dx > b.x && a.y < b.y+b.dy && a.y+a.dy > b.y && a.z < b.z+b.dz && a.z+a.dz > b.z;
}
export function transformPoint(point, tile, rotation=0) {
  switch(rotation) {
    case 90: return {x:tile.size.z-point.z,y:point.y,z:point.x};
    case 180:return {x:tile.size.x-point.x,y:point.y,z:tile.size.z-point.z};
    case 270:return {x:point.z,y:point.y,z:tile.size.x-point.x};
    default:return {x:point.x,y:point.y,z:point.z};
  }
}
export function inversePoint(point,tile,rotation=0) {
  switch(rotation) {
    case 90:return {x:point.z,y:point.y,z:tile.size.z-point.x};
    case 180:return {x:tile.size.x-point.x,y:point.y,z:tile.size.z-point.z};
    case 270:return {x:tile.size.x-point.z,y:point.y,z:point.x};
    default:return {...point};
  }
}
export function worldPoint(point,tile,placement) {
  const p=transformPoint(point,tile,placement.rotation);
  return {x:p.x+placement.x*16,y:p.y+placement.y*8,z:p.z+placement.z*16};
}
export function worldPorts(tile,placement) {
  return tile.ports.map(port=>({...port,...worldPoint(port,tile,placement),
    facing:FACES[(FACES.indexOf(port.facing)+placement.rotation/90)%4],placementId:placement.id,key:placement.id+':'+port.id}));
}
export function samePort(a,b) {
  return a.placementId!==b.placementId && OPPOSITE[a.facing]===b.facing &&
    (a.doorSettings?.type||'NORMAL')===(b.doorSettings?.type||'NORMAL') &&
    Math.abs(a.x-b.x)<0.001 && Math.abs(a.y-b.y)<0.001 && Math.abs(a.z-b.z)<0.001 &&
    a.width===b.width && a.height===b.height;
}
export function connections(project) {
  const tiles=new Map(project.tiles.map(t=>[t.id,t]));
  const ports=project.placements.flatMap(p=>{const t=tiles.get(p.tileId);return t?worldPorts(t,p):[];});
  const buckets=new Map(),pairs=[],connected=new Set();
  const key=(face,width,height,x,y,z)=>`${face}:${width}:${height}:${x}:${y}:${z}`;
  for(let i=0;i<ports.length;i++){
    const p=ports[i],k=key(p.facing,p.width,p.height,Math.floor(p.x),Math.floor(p.y),Math.floor(p.z));
    if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);
  }
  for(let i=0;i<ports.length;i++){
    const a=ports[i],matches=[];
    // Probe neighboring cells too: the existing sub-millimeter tolerance crosses cell boundaries.
    for(let x=Math.floor(a.x-.001);x<=Math.floor(a.x+.001);x++)
      for(let y=Math.floor(a.y-.001);y<=Math.floor(a.y+.001);y++)
        for(let z=Math.floor(a.z-.001);z<=Math.floor(a.z+.001);z++)
          for(const j of buckets.get(key(OPPOSITE[a.facing],a.width,a.height,x,y,z))||[])
            if(j>i&&samePort(a,ports[j]))matches.push(j);
    matches.sort((a,b)=>a-b);
    for(const j of matches){pairs.push({a,b:ports[j]});connected.add(a.key);connected.add(ports[j].key);}
  }
  return {ports,pairs,connected};
}
export function placementError(project,candidate,ignoreId=candidate.id) {
  const tile=tileOf(project,candidate);
  if(!tile) return '타일 원본을 찾을 수 없습니다.';
  if(!horizontal(candidate.x)||!horizontal(candidate.z)||!Number.isInteger(candidate.y)||Math.abs(candidate.y)>1024) return '가로 좌표는 1블록, 층 높이는 8블록 단위여야 합니다.';
  if(![0,90,180,270].includes(candidate.rotation)) return '회전은 0/90/180/270도만 가능합니다.';
  const occupied=bounds(tile,candidate);
  for(const other of project.placements) {
    if(other.id===ignoreId) continue;
    const otherTile=tileOf(project,other);
    if(otherTile){const at=conflictingBlock(tile,candidate,occupied,otherTile,other,bounds(otherTile,other));
      if(at)return tile.asset?.occupancy&&otherTile.asset?.occupancy?`다른 타일의 블록과 겹칩니다. 블록 좌표 X ${at.x}, Y ${at.y}, Z ${at.z}`:'설계도 점유 정보가 없는 타일의 저장 범위와 겹칩니다. 실제 설계도를 연결해 블록 겹침을 검사하세요.';
    }
  }
  return '';
}
export function portError(tile,port) {
  const {x,y,z,facing,width,height}=port;
  if(![x,y,z,width,height].every(Number.isFinite)||!FACES.includes(facing)) return '연결구 좌표와 방향을 확인하세요.';
  if(width<1 || width>64 || height<1 || height>tile.size.y || y<0 || y+height>tile.size.y) return '문 크기 또는 높이가 타일 범위를 벗어납니다.';
  if((facing==='north'||facing==='south') && (z!==(facing==='north'?0:tile.size.z)||x-width/2<0||x+width/2>tile.size.x)) return '남북 문은 해당 외곽 면에 있어야 합니다.';
  if((facing==='east'||facing==='west') && (x!==(facing==='west'?0:tile.size.x)||z-width/2<0||z+width/2>tile.size.z)) return '동서 문은 해당 외곽 면에 있어야 합니다.';
  return '';
}
export function validate(project) {
  const issues=[];
  const tileIndex=new Map(project.tiles.map(t=>[t.id,t]));
  const occupied=project.placements.map(p=>{const tile=tileIndex.get(p.tileId);return tile?bounds(tile,p):null;});
  const add=(severity,message,target=null)=>issues.push({severity,message,target});
  if(project.placements.length===0) add('error','배치된 타일이 없습니다.');
  const used=new Set(project.placements.map(p=>p.tileId));
  for(const tile of project.tiles.filter(t=>used.has(t.id))) {
    if(!tile.ports.length)add('error',`${tile.name}: 문 연결구가 최소 하나 필요합니다.`,{kind:'library',id:tile.id});
    if(!tile.asset) add('warning',`${tile.name}: 실제 Create 설계도를 연결해야 합니다.`,{kind:'library',id:tile.id});
    else if(!tile.asset.markerCount) add('error',`${tile.name}: 설계도에 Erosion Sector 문이 최소 하나 필요합니다.`,{kind:'library',id:tile.id});
    else if(!tile.asset.bytes)add('warning',`${tile.name}: 타일 폴더에서 ${tile.asset.reference||tile.asset.name} 원본을 연결하세요. 연결 전에는 저장 범위 전체로 겹침을 검사합니다.`,{kind:'library',id:tile.id});
    for(const port of tile.ports) {const error=portError(tile,port);if(error) add('error',`${tile.name}: ${error}`,{kind:'library',id:tile.id});}
  }
  for(let i=0;i<project.placements.length;i++) {
    const placement=project.placements[i],tile=tileIndex.get(placement.tileId);
    if(!tile) {add('error','원본이 없는 타일 배치입니다.',{kind:'placement',id:placement.id});continue;}
    if(!project.rooms.some(r=>r.id===placement.roomId)) add('error',`${placement.name||tile.name}: 방을 지정하세요.`,{kind:'placement',id:placement.id});
    for(let j=i+1;j<project.placements.length;j++) {
      const at=occupied[j]&&conflictingBlock(tile,placement,occupied[i],tileIndex.get(project.placements[j].tileId),project.placements[j],occupied[j]);
      if(at) {
        const other=project.placements[j],otherTile=tileIndex.get(other.tileId);
        add('error',`${placement.name||tile.name}과 ${other.name||otherTile.name}이 겹칩니다. 충돌 블록: (${at.x}, ${at.y}, ${at.z}).`,{kind:'placement',id:placement.id});
      }
    }
  }
  const network=connections(project);
  const portCounts=new Map();
  for(const pair of network.pairs) for(const port of [pair.a,pair.b]) portCounts.set(port.key,(portCounts.get(port.key)||0)+1);
  for(const port of network.ports) {
    if(port.required&&!network.connected.has(port.key)) add('error',`연결 필수 문 '${port.name||port.id}'이 연결되지 않았습니다.`,{kind:'placement',id:port.placementId});
    if((portCounts.get(port.key)||0)>1) add('error','문 하나에 연결 대상이 여러 개입니다.',{kind:'placement',id:port.placementId});
  }
  for(const type of ['spawn','extraction']) if(!project.gimmicks.some(g=>g.type===type)) add('error',`${KINDS[type].label}이 필요합니다.`);
  for(const gimmick of project.gimmicks) {
    const placement=project.placements.find(p=>p.id===gimmick.placementId),tile=placement&&tileOf(project,placement);
    if(!tile) {add('error',`${gimmick.name}: 소속 타일이 없습니다.`,{kind:'gimmick',id:gimmick.id});continue;}
    const p=gimmick.position;
    if(p.x<0||p.x>=tile.size.x||p.z<0||p.z>=tile.size.z||p.y<0||p.y>=tile.size.y) add('error',`${gimmick.name}: 타일 밖에 있습니다.`,{kind:'gimmick',id:gimmick.id});
  }
  for(const link of project.links) {
    if(!project.gimmicks.some(g=>g.id===link.from)||!project.gimmicks.some(g=>g.id===link.to)) add('error','대상이 없는 기믹 연결이 있습니다.');
    if(link.from===link.to) add('error','기믹을 자기 자신에 연결할 수 없습니다.');
  }
  const spawns=project.gimmicks.filter(g=>g.type==='spawn');
  if(spawns.length&&project.placements.length) {
    const reachable=new Set(spawns.map(g=>g.placementId));
    let changed=true;
    while(changed) {changed=false; for(const {a,b} of network.pairs) {
      if(reachable.has(a.placementId)&&!reachable.has(b.placementId)){reachable.add(b.placementId);changed=true;}
      if(reachable.has(b.placementId)&&!reachable.has(a.placementId)){reachable.add(a.placementId);changed=true;}
    }}
    const unreachable=project.placements.filter(p=>!reachable.has(p.id));
    if(unreachable.length) add('warning',`시작점에서 문 연결로 도달할 수 없는 타일이 ${unreachable.length}개입니다.`,{kind:'placement',id:unreachable[0].id});
  }
  add('info','현재 파일은 스테이지 설계용입니다. Minecraft 실행 연동과 기믹 동작은 아직 연결되지 않았습니다.');
  return issues;
}
export function exportStage(project) {
  const network=connections(project);
  return {format:'erosionsector-stage',version:2,status:'draft',runtimeReady:false,cellSize:CELL,tileRules:TILE_RULES,
    stage:{id:project.id,name:project.name,description:project.description,chapter:clone(project.chapter),missionCode:project.missionCode,minPlayers:project.minPlayers,maxPlayers:project.maxPlayers},
    zones:clone(project.zones),rooms:clone(project.rooms),
    tiles:project.tiles.map(t=>({id:t.id,name:t.name,category:t.category,size:clone(t.size),ports:clone(t.ports),asset:t.asset?{name:t.asset.name,reference:t.asset.reference,sha256:t.asset.sha256,blockCount:t.asset.blockCount,paletteCount:t.asset.paletteCount,entityCount:t.asset.entityCount,markerCount:t.asset.markerCount,namespaces:clone(t.asset.namespaces),dataVersion:t.asset.dataVersion}:null})),
    placements:project.placements.map(p=>({...p,blockPosition:{x:p.x*16,y:p.y*8,z:p.z*16}})),
    connections:network.pairs.map(({a,b})=>({from:{placementId:a.placementId,portId:a.id},to:{placementId:b.placementId,portId:b.id}})),
    gimmicks:clone(project.gimmicks),links:clone(project.links),validation:validate(project)};
}
const port=(id,x,y,z,facing,required=true)=>({id,name:id,x,y,z,facing,width:2,height:3,required});
export function demoProject() {
  const tiles=[
    {id:'start',name:'진입실',category:'시작',size:{x:16,y:8,z:16},ports:[port('동쪽 문',16,1,8,'east')]},
    {id:'corridor',name:'직선 복도',category:'이동',size:{x:16,y:8,z:16},ports:[port('서쪽 문',0,1,8,'west'),port('동쪽 문',16,1,8,'east')]},
    {id:'atrium',name:'복층 관측 홀',category:'복층',size:{x:32,y:16,z:32},ports:[port('하층 서문',0,1,8,'west'),port('하층 동문',32,1,8,'east'),port('상층 동문',32,9,24,'east')]},
    {id:'lab',name:'연구실',category:'목표',size:{x:32,y:8,z:16},ports:[port('서쪽 문',0,1,8,'west')]},
    {id:'server',name:'전력 제어실',category:'목표',size:{x:16,y:8,z:16},ports:[port('서쪽 문',0,1,8,'west')]},
    {id:'corner',name:'모서리 복도',category:'이동',size:{x:16,y:8,z:16},ports:[port('서쪽 문',0,1,8,'west'),port('남쪽 문',8,1,16,'south')]},
    {id:'storage',name:'보급 창고',category:'보급',size:{x:32,y:8,z:32},ports:[port('서쪽 문',0,1,8,'west')]}
  ].map(t=>({...t,asset:null}));
  const place=(id,tileId,x,y,z,roomId)=>({id,tileId,x,y,z,rotation:0,roomId,name:''});
  const placements=[place('p1','start',-2,0,0,'r1'),place('p2','corridor',-1,0,0,'r2'),place('p3','atrium',0,0,0,'r3'),
    place('p4','corridor',2,0,0,'r4'),place('p5','lab',3,0,0,'r5'),place('p6','corridor',2,1,1,'r6'),place('p7','server',3,1,1,'r7')];
  const gimmicks=[
    {id:'g1',type:'spawn',name:'진입 지점',placementId:'p1',position:{x:5,y:1,z:8},settings:{count:4}},
    {id:'g2',type:'alarm',name:'보안 경보',placementId:'p4',position:{x:8,y:1,z:8},settings:{duration:45}},
    {id:'g3',type:'wave',name:'연구실 방어전',placementId:'p5',position:{x:12,y:1,z:8},settings:{count:12,entity:'minecraft:zombie'}},
    {id:'g4',type:'supply',name:'제한 보급',placementId:'p5',position:{x:23,y:1,z:8},settings:{count:3}},
    {id:'g5',type:'terminal',name:'전력 복구',placementId:'p7',position:{x:8,y:1,z:8},settings:{duration:15}},
    {id:'g6',type:'extraction',name:'복귀 집결 지점',placementId:'p1',position:{x:11,y:1,z:8},settings:{duration:10}}
  ];
  return {format:'erosionsector-project',version:1,id:'a1-silent-observatory',name:'A1 · 잠든 관측소',
    description:'관측 시설의 전력을 복구하고 진입실로 돌아오세요. 복층 홀의 내부 계단으로 상층 제어실에 접근합니다.',chapter:{id:'a',name:'관측 시설',description:''},missionCode:'A1',minPlayers:1,maxPlayers:4,
    tiles,placements,gimmicks,links:[{id:'l1',from:'g2',to:'g3',event:'상호작용',action:'활성화'},{id:'l2',from:'g5',to:'g6',event:'목표 완료',action:'활성화'}],
    zones:[{id:'z1',name:'진입 시설',color:'#78968d'},{id:'z2',name:'관측 연구동',color:'#748eae'}],
    rooms:[{id:'r1',code:'A-101',name:'진입실',zoneId:'z1',color:'#7ba392'},{id:'r2',code:'A-102',name:'진입 복도',zoneId:'z1',color:'#6c8992'},
      {id:'r3',code:'A-103',name:'관측 홀',zoneId:'z1',color:'#809f9b'},{id:'r4',code:'B-201',name:'보안 통로',zoneId:'z2',color:'#b59b72'},
      {id:'r5',code:'B-202',name:'연구실',zoneId:'z2',color:'#8c93b5'},{id:'r6',code:'B-203',name:'상층 연결로',zoneId:'z2',color:'#688ea5'},
      {id:'r7',code:'B-204',name:'전력 제어실',zoneId:'z2',color:'#8c9fba'}]};
}
export function emptyProject() {
  const p=demoProject();p.id=uid('stage');p.name='새 스테이지';p.description='';p.chapter={id:'',name:'',description:''};p.missionCode='';p.placements=[];p.gimmicks=[];p.links=[];
  p.rooms=[{id:'r1',code:'A-101',name:'첫 번째 방',zoneId:'z1',color:'#7ba392'}];p.zones=[p.zones[0]];return p;
}
export function readProject(input) {
  const p=typeof input==='string'?JSON.parse(input):clone(input);
  const fail=message=>{throw new Error(message);};
  const text=(value,max=160)=>typeof value==='string'&&value.length<=max;
  const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
  if(!p||p.format!=='erosionsector-project'||p.version!==1) fail('지원하는 Erosion Sector 프로젝트 파일이 아닙니다.');
  if(!text(p.id)||!text(p.name)||!text(p.description,3000)) fail('프로젝트 이름 또는 설명이 올바르지 않습니다.');
  p.chapter??={id:'',name:'',description:''};p.missionCode??='';
  if(!p.chapter||!text(p.chapter.id)||!text(p.chapter.name)||!text(p.chapter.description,3000)||!text(p.missionCode))fail('챕터 또는 미션 정보가 올바르지 않습니다.');
  for(const [key,max] of [['tiles',200],['placements',1000],['gimmicks',3000],['links',5000],['rooms',1000],['zones',100]]) {
    if(!Array.isArray(p[key])||p[key].length>max) fail(`${key} 목록 크기가 올바르지 않습니다.`);
    if(new Set(p[key].map(x=>x?.id)).size!==p[key].length||p[key].some(x=>!x||!text(x.id))) fail(`${key}에 중복되거나 잘못된 ID가 있습니다.`);
  }
  if(!integer(p.minPlayers,1,16)||!integer(p.maxPlayers,p.minPlayers,16)) fail('참가 인원 설정이 올바르지 않습니다.');
  for(const t of p.tiles) {
    if(!text(t.name)||!text(t.category)||!t.size||!integer(t.size.x,1,256)||!integer(t.size.y,8,256)||t.size.y%8||!integer(t.size.z,1,256)) fail('타일 가로·깊이는 양의 정수, 높이는 8의 배수여야 합니다.');
    if(!Array.isArray(t.ports)||!t.ports.length||t.ports.length>128||new Set(t.ports.map(port=>port?.id)).size!==t.ports.length) fail('타일에는 문 연결구가 최소 하나 필요합니다.');
    for(const port of t.ports) if(!port||!text(port.id)||!text(port.name)||portError(t,port)) fail('타일 연결구가 올바르지 않습니다.');
    if(t.asset && (!text(t.asset.name,250)||(t.asset.bytes!==undefined&&(typeof t.asset.bytes!=='string'||t.asset.bytes.length>34_000_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(t.asset.bytes)))||(t.asset.reference!==undefined&&!tileReference(t.asset.reference))||typeof t.asset.sha256!=='string'||!/^[a-f0-9]{64}$/.test(t.asset.sha256)||!Array.isArray(t.asset.namespaces)||t.asset.namespaces.some(n=>!text(n,100))||!integer(t.asset.blockCount,0,16_777_216)||!integer(t.asset.paletteCount,0,1_000_000)||!integer(t.asset.markerCount,0,128))) fail('설계도 데이터 또는 tile 폴더 기준 경로가 올바르지 않습니다.');
    if(t.asset?.occupancy){const mask=t.asset.occupancy;
      if(typeof mask.bits!=='string'||mask.bits.length>2_800_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(mask.bits)||!integer(mask.count,0,t.size.x*t.size.y*t.size.z))fail('설계도 블록 점유 데이터가 올바르지 않습니다.');
      occupancy(t);
    }
  }
  for(const q of p.placements) if(!text(q.tileId)||!text(q.roomId)||!text(q.name)||!horizontal(q.x)||!horizontal(q.z)||!integer(q.y,-1024,1024)||![0,90,180,270].includes(q.rotation)) fail('타일 배치 데이터가 올바르지 않습니다.');
  for(const r of p.rooms) if(!text(r.name)||!text(r.code)||!text(r.zoneId)||!/^#[0-9a-f]{6}$/i.test(r.color)) fail('방 정보가 올바르지 않습니다.');
  for(const z of p.zones) if(!text(z.name)||!/^#[0-9a-f]{6}$/i.test(z.color)) fail('구역 정보가 올바르지 않습니다.');
  for(const g of p.gimmicks) if(!KINDS[g.type]||!text(g.name)||!text(g.placementId)||!g.position||!Object.values(g.position).every(Number.isFinite)||!['x','y','z'].every(k=>Number.isFinite(g.position[k]))||!g.settings||typeof g.settings!=='object') fail('기믹 정보가 올바르지 않습니다.');
  for(const l of p.links) if(!text(l.from)||!text(l.to)||!text(l.event)||!text(l.action)) fail('기믹 연결 정보가 올바르지 않습니다.');
  return p;
}
