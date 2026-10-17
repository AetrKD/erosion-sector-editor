import {isScan,scanSteps} from './scan.mjs';
import {scanCenter,scanMove,scanCandidates} from './authoring.mjs';
import {dimensions,worldPoint,connections,placementError,KINDS,inversePoint} from './core.mjs';
import {occupancy} from './occupancy.mjs';
import {createSceneIndex} from './scene-index.mjs';
import {PALETTE_MIME,createPaletteEvaluator} from './palette-placement.mjs';
import {boxCorners,createCamera,pickBox,sceneTarget,createIsoRenderer,drawIsoFallback,pointOnFloor} from './iso.mjs';
export function createMap(canvas,get,callbacks){
  const ctx=canvas.getContext('2d');
  let width=0,height=0,scale=65,pan={x:0,y:0},hover=null,drag=null,space=false,initialized=false;
  let isoRenderer,isoCamera,isoBoxes=[];
  let paletteBrush=null,paletteDrop=null;
  let networkProject,network,drawRequest=null,destroyed=false;
  let sceneProject,sceneIndex,lastZoom,lastCursor,lastCamera,lastDrop;
  function sceneFor(project=get().project){if(sceneProject!==project){sceneProject=project;sceneIndex=createSceneIndex(project);}return sceneIndex;}
  const evaluatePalette=createPaletteEvaluator(sceneFor);
  function reportZoom(){const value=Math.round(scale/65*100);if(value!==lastZoom){lastZoom=value;callbacks.zoom?.(value);}}
  function reportDrop(value){const key=value?value.valid+':'+value.message:null;if(key!==lastDrop){lastDrop=key;callbacks.dropPreview?.(value);}}
  const planMasks=new WeakMap(),scanMasks=new WeakMap();
  function slicePath(tile,floor,rotation){
    let cache=planMasks.get(tile);if(!cache){cache=new Map();planMasks.set(tile,cache);}
    const key=floor+':'+rotation;if(cache.has(key))return cache.get(key);
    const bits=occupancy(tile),path=new Path2D(),y0=Math.max(0,floor*8),y1=Math.min(tile.size.y,y0+8);
    for(let z=0;z<tile.size.z;z++)for(let x=0;x<tile.size.x;x++){
      let filled=false;for(let y=y0;y<y1;y++){const i=x+tile.size.x*(z+tile.size.z*y);if(bits[i>>3]&(1<<(i&7))){filled=true;break;}}
      if(!filled)continue;
      let rx=x,rz=z;if(rotation===90){rx=tile.size.z-1-z;rz=x;}else if(rotation===180){rx=tile.size.x-1-x;rz=tile.size.z-1-z;}else if(rotation===270){rx=z;rz=tile.size.x-1-x;}
      path.rect(rx,rz,1,1);
    }
    cache.set(key,path);return path;
  }
  function networkFor(project){if(networkProject!==project){networkProject=project;network=connections(project);}return network;}
  function requestDraw(){if(drawRequest===null&&!destroyed)drawRequest=requestAnimationFrame(()=>{drawRequest=null;draw();});}
  const orbit={azimuth:45,elevation:30,offset:{x:0,y:0}};
  function boxes(){const selected=get().selection;return sceneFor().geometry.map(b=>({...b,selected:selected?.kind==='placement'&&selected.id===b.id}));}
  function camera(list=null,unit=scale){return createCamera({width,height,scale:unit,target:list?sceneTarget(list):sceneFor().target,...orbit});}
  const snap=value=>Math.floor(value*16)/16;
  function screen(x,z){return {x:pan.x+x*scale,z:pan.y+z*scale};}
  function world(x,y){return {x:(x-pan.x)/scale,z:(y-pan.y)/scale};}
  function active(p){const t=sceneFor().tiles.get(p.tileId);return t&&p.y<=get().floor&&p.y+t.size.y/8>get().floor;}
  function fit(){
    if(get().view==='iso'){
      const list=boxes(),unit=camera(list,1),points=list.flatMap(b=>boxCorners(b).map(p=>unit.project(p)));
      orbit.offset={x:0,y:0};
      scale=points.length?Math.max(8,Math.min(130,(width-110)/Math.max(1,Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))),(height-150)/Math.max(1,Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))))):65;
      draw();return;
    }
    const p=get().project;
    if(!p.placements.length){scale=65;pan={x:width/2,y:height/2};draw();return;}
    // Sizes are stored in blocks, positions in grid cells.
    const endX=Math.max(...p.placements.map(q=>{const t=sceneFor(p).tiles.get(q.tileId);return t?q.x+dimensions(t,q.rotation).x/16:q.x;}));
    const endZ=Math.max(...p.placements.map(q=>{const t=sceneFor(p).tiles.get(q.tileId);return t?q.z+dimensions(t,q.rotation).z/16:q.z;}));
    const startX=Math.min(...p.placements.map(q=>q.x)),startZ=Math.min(...p.placements.map(q=>q.z));
    scale=Math.max(22,Math.min(320,(width-130)/(endX-startX+1),(height-155)/(endZ-startZ+1)));
    pan={x:width/2-(startX+endX)/2*scale,y:height/2-(startZ+endZ)/2*scale-5};draw();
  }
  function truncate(text,max){let s=text;while(s.length&&ctx.measureText(s).width>max)s=s.slice(0,-1);return s.length<text.length?s+'…':s;}
  function drawGrid(){
    const from=world(0,0),to=world(width,height);
    ctx.lineWidth=1;
    for(let x=Math.floor(from.x);x<=Math.ceil(to.x);x++){
      const sx=Math.round(pan.x+x*scale)+.5;ctx.strokeStyle=x===0?'#394c58':'#23303b';ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,height);ctx.stroke();
      if(x%2===0||scale>45){ctx.fillStyle='#566d7b';ctx.font='9px "Segoe UI",sans-serif';ctx.fillText(String(x*16),sx+5,Math.min(height-55,Math.max(56,pan.y+5*scale)));}
    }
    for(let z=Math.floor(from.z);z<=Math.ceil(to.z);z++){
      const sy=Math.round(pan.y+z*scale)+.5;ctx.strokeStyle=z===0?'#394c58':'#23303b';ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(width,sy);ctx.stroke();
      if(z%2===0||scale>45){ctx.fillStyle='#566d7b';ctx.font='9px "Segoe UI",sans-serif';ctx.fillText(String(z*16),Math.min(width-42,Math.max(15,pan.x-38)),sy+13);}
    }
  }
  function drawPlacement(p,ghost=false,preview=false,previewError){
    const state=get(),project=state.project,tile=sceneFor(project).tiles.get(p.tileId);if(!tile)return;
    const size=dimensions(tile,p.rotation),point=screen(p.x,p.z),w=size.x/16*scale,h=size.z/16*scale;
    if(point.x+w<0||point.z+h<0||point.x>width||point.z>height)return;
    const room=sceneFor(project).rooms.get(p.roomId),color=room?.color||'#8296a4';
    const selected=state.selection?.kind==='placement'&&state.selection.id===p.id;
    const roomSelected=state.selection?.kind==='room'&&state.selection.id===p.roomId;
    ctx.save();if(ghost)ctx.globalAlpha=.18;
    const invalid=preview&&(previewError??placementError(project,p,p.id,sceneFor(project)));
    ctx.fillStyle=invalid?'#ac626348':color+(selected?'70':roomSelected?'70':'38');ctx.fillRect(point.x+2,point.z+2,w-4,h-4);
    ctx.strokeStyle=invalid?'#e39494':selected||roomSelected?'#c4e7b8':color+'ba';ctx.lineWidth=selected?2:1;
    if(ghost||preview)ctx.setLineDash([5,4]);ctx.strokeRect(point.x+2.5,point.z+2.5,w-5,h-5);ctx.setLineDash([]);
    if(!ghost&&tile.asset?.occupancy){
      ctx.save();ctx.translate(point.x,point.z);ctx.scale(scale/16,scale/16);ctx.fillStyle=color+'68';
      ctx.fill(slicePath(tile,state.floor-p.y,p.rotation));ctx.restore();
    }
    if(!ghost){
      ctx.strokeStyle=color+'38';ctx.lineWidth=1;
      for(let x=1;x<size.x/16;x++){ctx.beginPath();ctx.moveTo(point.x+x*scale,point.z+4);ctx.lineTo(point.x+x*scale,point.z+h-4);ctx.stroke();}
      for(let z=1;z<size.z/16;z++){ctx.beginPath();ctx.moveTo(point.x+4,point.z+z*scale);ctx.lineTo(point.x+w-4,point.z+z*scale);ctx.stroke();}
      if(scale>30){ctx.fillStyle=selected?'#e1efd9':'#c0cdd1';ctx.font=`500 ${scale>55?11:9}px "Segoe UI","Malgun Gothic",sans-serif`;ctx.textAlign='center';
        ctx.fillText(truncate(room?.code||'미지정',w-12),point.x+w/2,point.z+h/2-3);
        ctx.font=`${scale>55?10:8}px "Malgun Gothic",sans-serif`;ctx.fillStyle='#9cafb8';
        ctx.fillText(truncate(p.name||tile.name,w-12),point.x+w/2,point.z+h/2+12);
        if(size.y>8&&w>80){ctx.textAlign='left';ctx.fillStyle='#b4cfbd';ctx.font='8px sans-serif';ctx.fillText(`복층 ${size.y/8} · ${state.floor-p.y+1}/${size.y/8}`,point.x+9,point.z+14);}
        ctx.textAlign='left';
      }
    }
    ctx.restore();
  }
  function drawPorts(){
    const state=get(),net=networkFor(state.project);
    for(const port of net.ports){
      if(Math.floor(port.y/8)!==state.floor)continue;
      const q=screen(port.x/16,port.z/16),connected=net.connected.has(port.key);
      const line=Math.max(10,port.width/16*scale);
      ctx.strokeStyle=state.selection?.kind==='door'&&state.selection.id===port.key?'#fff4b0':connected?'#c0e6af':port.required?'#dfad7f':'#859aa6';ctx.lineWidth=state.selection?.id===port.key?7:4;
      ctx.beginPath();if(['east','west'].includes(port.facing)){ctx.moveTo(q.x,q.z-line/2);ctx.lineTo(q.x,q.z+line/2);}else{ctx.moveTo(q.x-line/2,q.z);ctx.lineTo(q.x+line/2,q.z);}ctx.stroke();
      ctx.fillStyle='#101a20';ctx.fillRect(q.x-1.5,q.z-1.5,3,3);
    }
  }
  function gimmickPosition(g){const state=get(),p=sceneFor(state.project).placements.get(g.placementId),t=p&&sceneFor(state.project).tiles.get(p.tileId);return t?worldPoint(g.position,t,p):null;}
  function scanNodes(){
    const state=get(),out=[];
    for(const g of state.project.gimmicks.filter(g=>isScan(g.type)))for(const [index,raw] of scanSteps(g).entries()){
      const step=drag?.scan?.g.id===g.id&&drag.scan.index===index?{...raw,...drag.patch}:raw;
      const center=scanCenter(state.project,step,sceneFor(state.project));if(!center||Math.floor(center.y/8)!==state.floor)continue;
      out.push({g,index,step,center,at:screen(center.x/16,center.z/16),radius:(step.radius??2.5)*scale/16});
    }return out;
  }
  function drawGimmicks(){
    const state=get();
    const nodes=scanNodes();
    const selected=nodes.filter(n=>state.selection?.kind==='gimmick'&&state.selection.id===n.g.id);
    ctx.save();ctx.strokeStyle='#52f8cf88';ctx.setLineDash([5,5]);ctx.lineWidth=1;
    for(let i=1;i<selected.length;i++){const a=selected[i-1],b=selected[i];if(a.index+1!==b.index)continue;ctx.beginPath();ctx.moveTo(a.at.x,a.at.z);ctx.lineTo(b.at.x,b.at.z);ctx.stroke();}
    ctx.restore();
    for(const n of nodes){
      const chosen=state.selection?.id===n.g.id&&(state.selection.step??0)===n.index;
      if(chosen&&n.step.positionMode==='random'&&!drag?.scan){
        const p=sceneFor(state.project).placements.get(n.step.placementId),tile=p&&sceneFor(state.project).tiles.get(p.tileId);
        if(tile){const preview=scanCandidates(tile,n.step.position.y,n.step.radius??2.5,n.step.position);
          let masks=scanMasks.get(preview);if(!masks){masks={valid:new Path2D(),invalid:new Path2D()};for(const c of preview.cells)masks[c.valid?'valid':'invalid'].rect(c.x,c.z,1,1);scanMasks.set(preview,masks);}
          const origin=worldPoint({x:0,y:0,z:0},tile,p),axisX=worldPoint({x:1,y:0,z:0},tile,p),axisZ=worldPoint({x:0,y:0,z:1},tile,p),at=screen(origin.x/16,origin.z/16),unit=scale/16;
          ctx.save();ctx.transform((axisX.x-origin.x)*unit,(axisX.z-origin.z)*unit,(axisZ.x-origin.x)*unit,(axisZ.z-origin.z)*unit,at.x,at.z);ctx.fillStyle='#69df9738';ctx.fill(masks.valid);ctx.fillStyle='#e3816c20';ctx.fill(masks.invalid);ctx.restore();
        }
      }
      ctx.setLineDash(n.step.positionMode==='random'?[4,4]:[]);ctx.strokeStyle=chosen?'#d9fff2':n.index?'#7daeb0':'#52f8cf';ctx.fillStyle='#52f8cf14';ctx.lineWidth=chosen?2.5:1.5;
      ctx.beginPath();ctx.arc(n.at.x,n.at.z,n.radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=chosen?'#d9fff2':'#52f8cf';ctx.beginPath();ctx.arc(n.at.x,n.at.z,6,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#0f2527';ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.fillText(String(n.index+1),n.at.x,n.at.z+3);ctx.textAlign='left';
      if(chosen){const hx=n.at.x+Math.max(20,n.radius);ctx.strokeStyle='#d9fff2';ctx.beginPath();ctx.moveTo(n.at.x+n.radius,n.at.z);ctx.lineTo(hx,n.at.z);ctx.stroke();ctx.fillStyle='#d9fff2';ctx.fillRect(hx-4,n.at.z-4,8,8);ctx.font='11px "Malgun Gothic",sans-serif';ctx.fillText(`${n.g.name} · ${n.index+1}단계 · 반경 ${n.step.radius??2.5}`,n.at.x+10,n.at.z-13);}
    }
    for(const g of state.project.gimmicks){if(isScan(g.type))continue;const pos=gimmickPosition(g);if(!pos||Math.floor(pos.y/8)!==state.floor)continue;
      const p=screen(pos.x/16,pos.z/16),kind=KINDS[g.type],selected=state.selection?.kind==='gimmick'&&state.selection.id===g.id;
      const r=selected?11:9;ctx.fillStyle='#16212b';ctx.strokeStyle=kind.color;ctx.lineWidth=selected?2:1;ctx.beginPath();ctx.arc(p.x,p.z,r,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle=kind.color;ctx.font='bold 12px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(kind.icon,p.x,p.z);ctx.textBaseline='alphabetic';ctx.textAlign='left';
      if(selected){ctx.font='10px "Malgun Gothic",sans-serif';ctx.fillStyle='#d8e3db';ctx.fillText(g.name,p.x+15,p.z+4);}
    }
  }
  function drawIso(){
    isoBoxes=boxes();isoCamera=camera();
    const target=isoCamera.target,grid=10;
    for(let i=-grid;i<=grid;i++){
      const a=isoCamera.project([target[0]+i,0,target[2]-grid]),b=isoCamera.project([target[0]+i,0,target[2]+grid]);
      const c=isoCamera.project([target[0]-grid,0,target[2]+i]),d=isoCamera.project([target[0]+grid,0,target[2]+i]);
      ctx.strokeStyle='#22313c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.moveTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.stroke();
    }
    if(isoRenderer===undefined){try{isoRenderer=createIsoRenderer();}catch{isoRenderer=null;}}
    const accelerated=isoRenderer?.draw(ctx,isoBoxes,isoCamera,window.devicePixelRatio||1);
    if(!accelerated)drawIsoFallback(ctx,isoBoxes,isoCamera);
    for(const box of isoBoxes){
      if(scale<28&&!box.selected)continue;
      const center=[(box.min[0]+box.max[0])/2,box.max[1],(box.min[2]+box.max[2])/2],point=isoCamera.project(center);
      if(pickBox(isoBoxes,isoCamera,point.x,point.y)?.id!==box.id)continue;
      ctx.font='10px "Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#14202c';ctx.strokeText(box.label,point.x,point.y+3);ctx.fillStyle='#edf1e8';ctx.fillText(box.label,point.x,point.y+3);ctx.textAlign='left';
    }
    const key=[orbit.azimuth,orbit.elevation,!!accelerated].join(':');if(key!==lastCamera){lastCamera=key;callbacks.camera?.({...orbit,accelerated:!!accelerated});}
  }
  function draw(){
    if(drawRequest!==null){cancelAnimationFrame(drawRequest);drawRequest=null;}
    if(!width)return;const state=get();ctx.clearRect(0,0,width,height);ctx.fillStyle='#111a23';ctx.fillRect(0,0,width,height);
    if(state.view==='iso'){drawIso();drawPalettePreview();reportZoom();return;}
    drawGrid();
    if(state.ghost)for(const p of state.project.placements)if(!active(p))drawPlacement(p,true);
    for(const p of state.project.placements)if(active(p)&&p.id!==drag?.placement?.id)drawPlacement(p);
    drawPorts();drawGimmicks();
    if(paletteBrush)drawPalettePreview();
    else if(drag?.placement&&hover){const p={...drag.placement,x:snap(hover.x)-drag.offset.x,z:snap(hover.z)-drag.offset.z};drawPlacement(p,false,true);}
    else if(state.mode==='paint'&&state.brush?.kind==='tile'&&hover){const t=sceneFor(state.project).tiles.get(state.brush.id);if(t)drawPlacement({id:'preview',tileId:t.id,x:snap(hover.x),z:snap(hover.z),y:state.floor,rotation:state.brush.rotation||0,roomId:state.activeRoomId},false,true);}
    if(!state.project.placements.length){ctx.fillStyle='#7b919f';ctx.font='13px "Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.fillText('왼쪽에서 타일을 골라 첫 공간을 배치하세요',width/2,height/2);ctx.textAlign='left';}
    reportZoom();
  }
  function drawPalettePreview(){
    const item=paletteDrop;if(!item)return;const state=get(),valid=!item.error,color=valid?'#bbf4ac':'#ef9696';
    if(item.brush?.kind==='tile'&&item.placement){
      if(state.view==='plan')drawPlacement(item.placement,false,true,item.error);
      else {const p=item.placement,d=dimensions(item.tile,p.rotation),points=boxCorners({min:[p.x,p.y,p.z],max:[p.x+d.x/16,p.y+d.y/8,p.z+d.z/16]}).map(v=>isoCamera.project(v));
        ctx.save();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.beginPath();for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]){ctx.moveTo(points[a].x,points[a].y);ctx.lineTo(points[b].x,points[b].y);}ctx.stroke();ctx.restore();
      }
    }else if(item.brush?.kind==='gimmick'&&item.position){
      const w=worldPoint(item.position,item.tile,item.placement),at=state.view==='iso'?isoCamera.project([w.x/16,w.y/8,w.z/16]):(()=>{const s=screen(w.x/16,w.z/16);return {x:s.x,y:s.z};})();
      ctx.save();ctx.strokeStyle=color;ctx.fillStyle='#142128cc';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.beginPath();ctx.arc(at.x,at.y,15,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(KINDS[item.brush.id].icon,at.x,at.y);ctx.restore();
    }
  }
  function clearPalette(){const changed=paletteBrush!==null||paletteDrop!==null;paletteBrush=null;paletteDrop=null;delete canvas.dataset.dropState;if(changed){reportDrop(null);draw();}}
  function previewDrop(e,fresh=false){
    if(!paletteBrush||!e.dataTransfer?.types.includes(PALETTE_MIME))return null;
    const pos=xy(e),state=get(),point=state.view==='iso'?pointOnFloor(camera(),pos.x,pos.y,state.floor):{...world(pos.x,pos.y),y:state.floor};
    const next=evaluatePalette(state.project,paletteBrush,point,state.activeRoomId,{fresh});
    paletteDrop=next;canvas.dataset.dropState=next.error?'invalid':'valid';
    const name=paletteBrush.kind==='tile'?next.tile?.name:KINDS[paletteBrush.id]?.label;
    reportDrop({valid:!next.error,message:next.error||`${name} · ${state.floor>=0?state.floor+1+'층':'지하 '+Math.abs(state.floor)+'층'} · 놓아서 배치`});requestDraw();return next;
  }
  canvas.addEventListener('dragover',e=>{const item=previewDrop(e);if(!item)return;e.preventDefault();e.dataTransfer.dropEffect=item.error?'none':'copy';});
  canvas.addEventListener('dragenter',e=>{if(paletteBrush&&e.dataTransfer?.types.includes(PALETTE_MIME))e.preventDefault();});
  canvas.addEventListener('dragleave',()=>{paletteDrop=null;delete canvas.dataset.dropState;reportDrop(null);requestDraw();});
  canvas.addEventListener('drop',e=>{const item=previewDrop(e,true);if(!item)return;e.preventDefault();clearPalette();if(item.error){callbacks.notify?.(item.error,true);return;}callbacks.drop?.(item);});
  document.addEventListener('dragend',clearPalette);
  function hitTile(x,z){return [...get().project.placements].reverse().find(p=>{if(!active(p))return false;const t=sceneFor().tiles.get(p.tileId),d=dimensions(t,p.rotation);return x>=p.x&&x<p.x+d.x/16&&z>=p.z&&z<p.z+d.z/16;});}
  function hitGimmick(x,y){const state=get();return [...state.project.gimmicks].reverse().find(g=>{const p=gimmickPosition(g);if(isScan(g.type)||!p||Math.floor(p.y/8)!==state.floor)return false;const s=screen(p.x/16,p.z/16);return Math.hypot(s.x-x,s.z-y)<13;});}
  const xy=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  canvas.addEventListener('pointerdown',e=>{
    const pos=xy(e);canvas.focus();if(e.button===2){e.preventDefault();callbacks.cancel?.();return;}
    if(e.button===1||space){drag={pan:true,start:pos,original:{...(get().view==='iso'?orbit.offset:pan)},iso:get().view==='iso'};canvas.setPointerCapture(e.pointerId);return;}
    if(e.button!==0)return;const state=get();
    if(state.view==='iso'){drag={orbit:true,start:pos,azimuth:orbit.azimuth,elevation:orbit.elevation,moved:false};canvas.setPointerCapture(e.pointerId);return;}
    const p=world(pos.x,pos.y);hover=p;
    if(state.mode==='paint'&&state.brush?.kind==='tile'){callbacks.place(snap(p.x),state.floor,snap(p.z));return;}
    if(state.mode==='gimmick'&&state.brush){const tile=hitTile(p.x,p.z);if(tile){const source=sceneFor(state.project).tiles.get(tile.tileId),local=inversePoint({x:(p.x-tile.x)*16,y:(state.floor-tile.y)*8+1,z:(p.z-tile.z)*16},source,tile.rotation);callbacks.gimmick(tile,local);}else callbacks.notify('기믹은 배치된 타일 안에 놓아주세요.',true);return;}
    const nodes=scanNodes().reverse(),node=nodes.find(n=>state.selection?.id===n.g.id&&(state.selection.step??0)===n.index&&Math.hypot(pos.x-n.at.x-Math.max(20,n.radius),pos.y-n.at.z)<10)||nodes.find(n=>Math.hypot(pos.x-n.at.x,pos.y-n.at.z)<10||Math.abs(Math.hypot(pos.x-n.at.x,pos.y-n.at.z)-n.radius)<5);
    if(node){const resize=state.selection?.id===node.g.id&&(state.selection.step??0)===node.index&&Math.hypot(pos.x-node.at.x-Math.max(20,node.radius),pos.y-node.at.z)<10;callbacks.select({kind:'gimmick',id:node.g.id,step:node.index});drag={scan:node,resize,start:pos,offset:{x:node.center.x-p.x*16,z:node.center.z-p.z*16},patch:null};canvas.setPointerCapture(e.pointerId);draw();return;}
    const port=networkFor(state.project).ports.find(port=>{if(Math.floor(port.y/8)!==state.floor)return false;const q=screen(port.x/16,port.z/16),half=Math.max(10,port.width/16*scale)/2;return ['east','west'].includes(port.facing)?Math.abs(pos.x-q.x)<7&&Math.abs(pos.y-q.z)<half+5:Math.abs(pos.y-q.z)<7&&Math.abs(pos.x-q.x)<half+5;});
    if(port){callbacks.select({kind:'door',id:port.key});return;}
    const gimmick=hitGimmick(pos.x,pos.y);if(gimmick){callbacks.select({kind:'gimmick',id:gimmick.id});return;}
    const tile=hitTile(p.x,p.z);callbacks.select(tile?{kind:'placement',id:tile.id}:null);
    if(tile){drag={placement:{...tile},start:pos,offset:{x:snap(p.x)-tile.x,z:snap(p.z)-tile.z}};canvas.setPointerCapture(e.pointerId);}draw();
  });
  canvas.addEventListener('pointermove',e=>{const pos=xy(e);hover=world(pos.x,pos.y);
    if(drag?.pan){const next={x:drag.original.x+pos.x-drag.start.x,y:drag.original.y+pos.y-drag.start.y};if(drag.iso)orbit.offset=next;else pan=next;}
    if(drag?.orbit&&(drag.moved||Math.hypot(pos.x-drag.start.x,pos.y-drag.start.y)>4)){drag.moved=true;orbit.azimuth=((drag.azimuth-(pos.x-drag.start.x)*.4)%360+360)%360;orbit.elevation=Math.max(15,Math.min(80,drag.elevation+(pos.y-drag.start.y)*.3));}
    if(drag?.scan&&Math.hypot(pos.x-drag.start.x,pos.y-drag.start.y)<=3)drag.patch=null;
    if(drag?.scan&&Math.hypot(pos.x-drag.start.x,pos.y-drag.start.y)>3){
      if(drag.resize)drag.patch={radius:Math.max(.5,Math.min(16,Math.round(((drag.scan.step.radius??2.5)+(Math.hypot(pos.x-drag.scan.at.x,pos.y-drag.scan.at.z)-Math.hypot(drag.start.x-drag.scan.at.x,drag.start.y-drag.scan.at.z))*16/scale)*2)/2))};
      else try{drag.patch=scanMove(get().project,drag.scan.g,drag.scan.index,{x:hover.x*16+drag.offset.x,y:drag.scan.center.y,z:hover.z*16+drag.offset.z},sceneFor());}catch{drag.patch=null;}
      canvas.style.cursor=drag.resize?'ew-resize':'grabbing';
    }
    if(get().view!=='iso'){const x=snap(hover.x),y=get().floor,z=snap(hover.z),key=[x,y,z].join(':');if(key!==lastCursor){lastCursor=key;callbacks.cursor?.(x,y,z);}}requestDraw();});
  canvas.addEventListener('pointerup',e=>{if(drag?.scan&&drag.patch)callbacks.scan?.(drag.scan.g.id,drag.scan.index,drag.patch);canvas.style.cursor='';if(drag?.orbit&&!drag.moved&&isoCamera){const pos=xy(e),hit=pickBox(isoBoxes,isoCamera,pos.x,pos.y);callbacks.select(hit?{kind:'placement',id:hit.id}:null);}
    if(drag?.placement){const point=world(xy(e).x,xy(e).y),p={...drag.placement,x:snap(point.x)-drag.offset.x,z:snap(point.z)-drag.offset.z};if(p.x!==drag.placement.x||p.z!==drag.placement.z)callbacks.move(p);}drag=null;draw();});
  canvas.addEventListener('pointercancel',()=>{drag=null;canvas.style.cursor='';draw();});canvas.addEventListener('pointerleave',()=>{if(!drag)hover=null;draw();});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();const point=xy(e),before=world(point.x,point.y),next=Math.max(get().view==='iso'?8:20,Math.min(get().view==='iso'?130:1024,scale*(e.deltaY<0?1.12:1/1.12)));
    if(get().view==='iso'){const factor=next/scale;orbit.offset={x:point.x-width/2-(point.x-width/2-orbit.offset.x)*factor,y:point.y-height/2-(point.y-height/2-orbit.offset.y)*factor};}
    else pan={x:point.x-before.x*next,y:point.y-before.z*next};scale=next;draw();},{passive:false});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag?.scan){drag=null;canvas.style.cursor='';draw();}if(e.code==='Space'&&e.target===canvas){space=true;e.preventDefault();}});window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;drag=null;});
  const observer=new ResizeObserver(()=>{const r=canvas.getBoundingClientRect();width=r.width;height=r.height;const ratio=window.devicePixelRatio||1;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);if(!initialized){initialized=true;fit();}else draw();});observer.observe(canvas);
  return {draw,fit,beginPaletteDrag(brush){paletteBrush={...brush};paletteDrop=null;drag=null;},endPaletteDrag:clearPalette,projectPoint(point){if(get().view==='iso')return camera().project([point.x/16,(point.y??get().floor*8)/8,point.z/16]);const s=screen(point.x/16,point.z/16);return {x:s.x,y:s.z};},rotateCamera(delta){orbit.azimuth=(orbit.azimuth+delta+360)%360;draw();},resetCamera(){orbit.azimuth=45;orbit.elevation=30;fit();},cameraState:()=>({azimuth:orbit.azimuth,elevation:orbit.elevation,offset:{...orbit.offset}}),zoom(factor){scale=Math.max(get().view==='iso'?8:20,Math.min(get().view==='iso'?130:1024,scale*factor));draw();},focus(placement,detail=false){const t=sceneFor().tiles.get(placement.tileId);if(!t)return;const d=dimensions(t,placement.rotation);if(detail)scale=Math.min(800,Math.max(130,(Math.min(width,height)-160)*16/Math.max(d.x,d.z)));pan={x:width/2-(placement.x+d.x/32)*scale,y:height/2-(placement.z+d.z/32)*scale};if(get().view==='iso'){const c=camera(boxes(),scale),point=c.project([placement.x+d.x/32,placement.y+d.y/16,placement.z+d.z/32]);orbit.offset.x+=width/2-point.x;orbit.offset.y+=height/2-point.y;}draw();},destroy(){document.removeEventListener('dragend',clearPalette);destroyed=true;if(drawRequest!==null)cancelAnimationFrame(drawRequest);observer.disconnect();isoRenderer?.destroy();}};
}
