import {dimensions,bounds,worldPoint,worldPorts,tileOf,connections,placementError,KINDS,inversePoint} from './core.mjs';
export function createMap(canvas,get,callbacks){
  const ctx=canvas.getContext('2d');
  let width=0,height=0,scale=65,pan={x:0,y:0},hover=null,drag=null,space=false,initialized=false;
  const projected=[];
  function screen(x,z){return {x:pan.x+x*scale,z:pan.y+z*scale};}
  function world(x,y){return {x:(x-pan.x)/scale,z:(y-pan.y)/scale};}
  function active(p){const t=tileOf(get().project,p);return t&&p.y<=get().floor&&p.y+t.size.y/8>get().floor;}
  function fit(){
    const p=get().project;
    if(!p.placements.length){scale=65;pan={x:width/2,y:height/2};draw();return;}
    // Sizes are stored in blocks, positions in grid cells.
    const endX=Math.max(...p.placements.map(q=>{const t=tileOf(p,q);return t?q.x+dimensions(t,q.rotation).x/16:q.x;}));
    const endZ=Math.max(...p.placements.map(q=>{const t=tileOf(p,q);return t?q.z+dimensions(t,q.rotation).z/16:q.z;}));
    const startX=Math.min(...p.placements.map(q=>q.x)),startZ=Math.min(...p.placements.map(q=>q.z));
    scale=Math.max(22,Math.min(90,(width-130)/(endX-startX+1),(height-155)/(endZ-startZ+1)));
    pan={x:width/2-(startX+endX)/2*scale,y:height/2-(startZ+endZ)/2*scale-5};draw();
  }
  function truncate(text,max){let s=text;while(s.length&&ctx.measureText(s).width>max)s=s.slice(0,-1);return s.length<text.length?s+'…':s;}
  function drawGrid(){
    const from=world(0,0),to=world(width,height);
    ctx.lineWidth=1;
    for(let x=Math.floor(from.x);x<=Math.ceil(to.x);x++){
      const sx=Math.round(pan.x+x*scale)+.5;ctx.strokeStyle=x===0?'#394c58':'#23303b';ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,height);ctx.stroke();
      if(x%2===0||scale>45){ctx.fillStyle='#566d7b';ctx.font='9px "Segoe UI",sans-serif';ctx.fillText(String(x),sx+5,Math.min(height-55,Math.max(56,pan.y+5*scale)));}
    }
    for(let z=Math.floor(from.z);z<=Math.ceil(to.z);z++){
      const sy=Math.round(pan.y+z*scale)+.5;ctx.strokeStyle=z===0?'#394c58':'#23303b';ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(width,sy);ctx.stroke();
      if(z%2===0||scale>45){ctx.fillStyle='#566d7b';ctx.font='9px "Segoe UI",sans-serif';ctx.fillText(String(z),Math.min(width-42,Math.max(15,pan.x-38)),sy+13);}
    }
  }
  function drawPlacement(p,ghost=false,preview=false){
    const state=get(),project=state.project,tile=tileOf(project,p);if(!tile)return;
    const size=dimensions(tile,p.rotation),point=screen(p.x,p.z),w=size.x/16*scale,h=size.z/16*scale;
    const room=project.rooms.find(r=>r.id===p.roomId),color=room?.color||'#8296a4';
    const selected=state.selection?.kind==='placement'&&state.selection.id===p.id;
    const roomSelected=state.selection?.kind==='room'&&state.selection.id===p.roomId;
    ctx.save();if(ghost)ctx.globalAlpha=.18;
    const invalid=preview&&placementError(project,p);
    ctx.fillStyle=invalid?'#ac626348':color+(selected?'70':roomSelected?'70':'38');ctx.fillRect(point.x+2,point.z+2,w-4,h-4);
    ctx.strokeStyle=invalid?'#e39494':selected||roomSelected?'#c4e7b8':color+'ba';ctx.lineWidth=selected?2:1;
    if(ghost||preview)ctx.setLineDash([5,4]);ctx.strokeRect(point.x+2.5,point.z+2.5,w-5,h-5);ctx.setLineDash([]);
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
    const state=get(),net=connections(state.project);
    for(const port of net.ports){
      if(Math.floor(port.y/8)!==state.floor)continue;
      const q=screen(port.x/16,port.z/16),connected=net.connected.has(port.key);
      const line=Math.max(10,port.width/16*scale);
      ctx.strokeStyle=connected?'#c0e6af':port.required?'#dfad7f':'#859aa6';ctx.lineWidth=4;
      ctx.beginPath();if(['east','west'].includes(port.facing)){ctx.moveTo(q.x,q.z-line/2);ctx.lineTo(q.x,q.z+line/2);}else{ctx.moveTo(q.x-line/2,q.z);ctx.lineTo(q.x+line/2,q.z);}ctx.stroke();
      ctx.fillStyle='#101a20';ctx.fillRect(q.x-1.5,q.z-1.5,3,3);
    }
  }
  function gimmickPosition(g){const state=get(),p=state.project.placements.find(q=>q.id===g.placementId),t=p&&tileOf(state.project,p);return t?worldPoint(g.position,t,p):null;}
  function drawGimmicks(){
    const state=get();
    for(const g of state.project.gimmicks){const pos=gimmickPosition(g);if(!pos||Math.floor(pos.y/8)!==state.floor)continue;
      const p=screen(pos.x/16,pos.z/16),kind=KINDS[g.type],selected=state.selection?.kind==='gimmick'&&state.selection.id===g.id;
      const r=selected?11:9;ctx.fillStyle='#16212b';ctx.strokeStyle=kind.color;ctx.lineWidth=selected?2:1;ctx.beginPath();ctx.arc(p.x,p.z,r,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle=kind.color;ctx.font='bold 12px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(kind.icon,p.x,p.z);ctx.textBaseline='alphabetic';ctx.textAlign='left';
      if(selected){ctx.font='10px "Malgun Gothic",sans-serif';ctx.fillStyle='#d8e3db';ctx.fillText(g.name,p.x+15,p.z+4);}
    }
  }
  function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
  function drawIso(){
    const state=get(),list=state.project.placements.map(p=>({p,t:tileOf(state.project,p)})).filter(o=>o.t);
    projected.length=0;if(!list.length)return;
    const s=Math.min(scale,62),projection=(x,y,z)=>({x:width/2+(x-z)*s*.62,y:height/2+(x+z)*s*.29-y*s*.65});
    const xs=list.flatMap(({p,t})=>[p.x,p.x+dimensions(t,p.rotation).x/16]),zs=list.flatMap(({p,t})=>[p.z,p.z+dimensions(t,p.rotation).z/16]);
    const cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;
    const proj=(x,y,z)=>projection(x-cx,y-.5,z-cz);
    const grid=10;for(let i=-grid;i<=grid;i++){
      const a=proj(cx+i,0,cz-grid),b=proj(cx+i,0,cz+grid);ctx.strokeStyle='#22313c';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      const c=proj(cx-grid,0,cz+i),d=proj(cx+grid,0,cz+i);ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.stroke();
    }
    list.sort((a,b)=>(a.p.x+a.p.z)-(b.p.x+b.p.z)||a.p.y-b.p.y);
    for(const {p,t} of list){const d=dimensions(t,p.rotation),x=p.x,z=p.z,y=p.y,dx=d.x/16,dz=d.z/16,dy=d.y/8;
      const a=proj(x,y+dy,z),b=proj(x+dx,y+dy,z),c=proj(x+dx,y+dy,z+dz),e=proj(x,y+dy,z+dz),bottomB=proj(x+dx,y,z),bottomC=proj(x+dx,y,z+dz),bottomE=proj(x,y,z+dz);
      const room=state.project.rooms.find(r=>r.id===p.roomId),color=room?.color||'#8296a4',selected=state.selection?.kind==='placement'&&state.selection.id===p.id;
      const stroke=selected?'#d0efc0':color+'d0';polygon([b,c,bottomC,bottomB],color+'45',stroke);polygon([e,c,bottomC,bottomE],color+'65',stroke);polygon([a,b,c,e],color+'95',stroke);
      const middle={x:(a.x+c.x)/2,y:(a.y+c.y)/2};ctx.fillStyle='#edf1e8';ctx.font='10px "Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.fillText(room?.code||t.name,middle.x,middle.y+3);ctx.textAlign='left';
      projected.push({p,points:[a,b,c,e,bottomB,bottomC,bottomE]});
    }
  }
  function draw(){
    if(!width)return;const state=get();ctx.clearRect(0,0,width,height);ctx.fillStyle='#111a23';ctx.fillRect(0,0,width,height);
    if(state.view==='iso'){drawIso();callbacks.zoom?.(Math.round(scale/65*100));return;}
    drawGrid();
    if(state.ghost)for(const p of state.project.placements)if(!active(p))drawPlacement(p,true);
    for(const p of state.project.placements)if(active(p)&&p.id!==drag?.placement?.id)drawPlacement(p);
    drawPorts();drawGimmicks();
    if(drag?.placement&&hover){const p={...drag.placement,x:Math.floor(hover.x)-drag.offset.x,z:Math.floor(hover.z)-drag.offset.z};drawPlacement(p,false,true);}
    else if(state.mode==='paint'&&state.brush?.kind==='tile'&&hover){const t=state.project.tiles.find(t=>t.id===state.brush.id);if(t)drawPlacement({id:'preview',tileId:t.id,x:Math.floor(hover.x),z:Math.floor(hover.z),y:state.floor,rotation:state.brush.rotation||0,roomId:state.activeRoomId},false,true);}
    if(!state.project.placements.length){ctx.fillStyle='#7b919f';ctx.font='13px "Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.fillText('왼쪽에서 타일을 골라 첫 공간을 배치하세요',width/2,height/2);ctx.textAlign='left';}
    callbacks.zoom?.(Math.round(scale/65*100));
  }
  function hitTile(x,z){return [...get().project.placements].reverse().find(p=>{if(!active(p))return false;const t=tileOf(get().project,p),d=dimensions(t,p.rotation);return x>=p.x&&x<p.x+d.x/16&&z>=p.z&&z<p.z+d.z/16;});}
  function hitGimmick(x,y){const state=get();return [...state.project.gimmicks].reverse().find(g=>{const p=gimmickPosition(g);if(!p||Math.floor(p.y/8)!==state.floor)return false;const s=screen(p.x/16,p.z/16);return Math.hypot(s.x-x,s.z-y)<13;});}
  const xy=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  canvas.addEventListener('pointerdown',e=>{
    const pos=xy(e);canvas.focus();if(e.button===2){e.preventDefault();callbacks.cancel?.();return;}
    if(e.button===1||space){drag={pan:true,start:pos,original:{...pan}};canvas.setPointerCapture(e.pointerId);return;}
    if(e.button!==0)return;const state=get();
    if(state.view==='iso'){const hit=[...projected].reverse().find(o=>{const xs=o.points.map(q=>q.x),ys=o.points.map(q=>q.y);return pos.x>=Math.min(...xs)&&pos.x<=Math.max(...xs)&&pos.y>=Math.min(...ys)&&pos.y<=Math.max(...ys);});callbacks.select(hit?{kind:'placement',id:hit.p.id}:null);return;}
    const p=world(pos.x,pos.y);hover=p;
    if(state.mode==='paint'&&state.brush?.kind==='tile'){callbacks.place(Math.floor(p.x),state.floor,Math.floor(p.z));return;}
    if(state.mode==='gimmick'&&state.brush){const tile=hitTile(p.x,p.z);if(tile){const source=tileOf(state.project,tile),local=inversePoint({x:(p.x-tile.x)*16,y:(state.floor-tile.y)*8+1,z:(p.z-tile.z)*16},source,tile.rotation);callbacks.gimmick(tile,local);}else callbacks.notify('기믹은 배치된 타일 안에 놓아주세요.',true);return;}
    const gimmick=hitGimmick(pos.x,pos.y);if(gimmick){callbacks.select({kind:'gimmick',id:gimmick.id});return;}
    const tile=hitTile(p.x,p.z);callbacks.select(tile?{kind:'placement',id:tile.id}:null);
    if(tile){drag={placement:{...tile},start:pos,offset:{x:Math.floor(p.x)-tile.x,z:Math.floor(p.z)-tile.z}};canvas.setPointerCapture(e.pointerId);}draw();
  });
  canvas.addEventListener('pointermove',e=>{const pos=xy(e);hover=world(pos.x,pos.y);if(drag?.pan){pan={x:drag.original.x+pos.x-drag.start.x,y:drag.original.y+pos.y-drag.start.y};}callbacks.cursor?.(Math.floor(hover.x),get().floor,Math.floor(hover.z));draw();});
  canvas.addEventListener('pointerup',e=>{if(drag?.placement){const point=world(xy(e).x,xy(e).y),p={...drag.placement,x:Math.floor(point.x)-drag.offset.x,z:Math.floor(point.z)-drag.offset.z};if(p.x!==drag.placement.x||p.z!==drag.placement.z)callbacks.move(p);}drag=null;draw();});
  canvas.addEventListener('pointercancel',()=>{drag=null;draw();});canvas.addEventListener('pointerleave',()=>{if(!drag)hover=null;draw();});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();const point=xy(e),before=world(point.x,point.y),next=Math.max(20,Math.min(130,scale*(e.deltaY<0?1.12:1/1.12)));scale=next;pan={x:point.x-before.x*scale,y:point.y-before.z*scale};draw();},{passive:false});
  window.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===canvas){space=true;e.preventDefault();}});window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;drag=null;});
  const observer=new ResizeObserver(()=>{const r=canvas.getBoundingClientRect();width=r.width;height=r.height;const ratio=window.devicePixelRatio||1;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);if(!initialized){initialized=true;fit();}else draw();});observer.observe(canvas);
  return {draw,fit,zoom(factor){scale=Math.max(20,Math.min(130,scale*factor));draw();},focus(placement){const t=tileOf(get().project,placement);if(!t)return;const d=dimensions(t,placement.rotation);pan={x:width/2-(placement.x+d.x/32)*scale,y:height/2-(placement.z+d.z/32)*scale};draw();},destroy(){observer.disconnect();}};
}
