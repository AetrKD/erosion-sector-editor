// Orthographic camera shared by rendering, fitting and visible-surface picking.
export const boxCorners = box => [
  [box.min[0],box.min[1],box.min[2]], [box.max[0],box.min[1],box.min[2]],
  [box.max[0],box.min[1],box.max[2]], [box.min[0],box.min[1],box.max[2]],
  [box.min[0],box.max[1],box.min[2]], [box.max[0],box.max[1],box.min[2]],
  [box.max[0],box.max[1],box.max[2]], [box.min[0],box.max[1],box.max[2]]
];
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
export function createCamera({width,height,scale,target,azimuth,elevation,offset={x:0,y:0}}){
  const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
  const right=[Math.cos(a),0,-Math.sin(a)];
  const down=[Math.sin(a)*Math.sin(e),-Math.cos(e),Math.cos(a)*Math.sin(e)];
  const toward=[Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)];
  const center={x:width/2+offset.x,y:height/2+offset.y};
  return {width,height,scale,target,toward,
    project(point){const v=point.map((n,i)=>n-target[i]);return {x:center.x+dot(v,right)*scale,y:center.y+dot(v,down)*scale,depth:dot(v,toward)};},
    ray(x,y){const sx=(x-center.x)/scale,sy=(y-center.y)/scale;return {origin:target.map((v,i)=>v+right[i]*sx+down[i]*sy),direction:toward};}
  };
}
/** Intersect the cursor ray with the explicitly selected eight-block floor plane. */
export function pointOnFloor(camera,x,y,floor){
  const {origin,direction}=camera.ray(x,y);
  if(Math.abs(direction[1])<1e-8)return null;
  const t=(floor-origin[1])/direction[1];
  return {x:origin[0]+direction[0]*t,y:floor,z:origin[2]+direction[2]*t};
}
export function pickBox(boxes,camera,x,y){
  const {origin,direction}=camera.ray(x,y);let hit=null,nearest=-Infinity;
  for(const box of boxes){
    let low=-Infinity,high=Infinity;
    for(let i=0;i<3;i++){
      if(Math.abs(direction[i])<1e-10){if(origin[i]<box.min[i]-1e-8||origin[i]>box.max[i]+1e-8){high=-Infinity;break;}}
      else {const a=(box.min[i]-origin[i])/direction[i],b=(box.max[i]-origin[i])/direction[i];low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));}
    }
    // Larger camera depth is closer to the viewer, independent of array order.
    if(high>=low-1e-8&&high>nearest){nearest=high;hit=box;}
  }
  return hit;
}
export function sceneTarget(boxes){
  return [0,1,2].map(i=>boxes.length?(Math.min(...boxes.map(b=>b.min[i]))+Math.max(...boxes.map(b=>b.max[i])))/2:0);
}
const faces=[{v:[4,5,6,7],shade:1},{v:[0,3,2,1],shade:.48},{v:[0,1,5,4],shade:.68},{v:[3,7,6,2],shade:.84},{v:[0,4,7,3],shade:.72},{v:[1,2,6,5],shade:.88}];
const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
export function createIsoRenderer(){
  const surface=document.createElement('canvas');
  const gl=surface.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true,premultipliedAlpha:false});
  if(!gl)return null;
  const program=gl.createProgram();
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('입체 렌더러를 시작할 수 없습니다.');gl.attachShader(program,s);gl.deleteShader(s);}
  shader(gl.VERTEX_SHADER,'attribute vec3 position; attribute vec3 color; varying vec3 tint; void main(){gl_Position=vec4(position,1.0);tint=color;}');
  shader(gl.FRAGMENT_SHADER,'precision mediump float; varying vec3 tint; void main(){gl_FragColor=vec4(tint,1.0);}');
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;
  const buffer=gl.createBuffer(),position=gl.getAttribLocation(program,'position'),color=gl.getAttribLocation(program,'color');
  let lost=false;surface.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;});surface.addEventListener('webglcontextrestored',()=>{lost=true;});
  return {
    draw(ctx,boxes,camera,ratio){
      if(lost)return false;
      const w=Math.round(camera.width*ratio),h=Math.round(camera.height*ratio);
      if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;}
      gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(color);gl.vertexAttribPointer(color,3,gl.FLOAT,false,24,12);
      const depth=Math.max(10,...boxes.flatMap(box=>boxCorners(box).map(v=>Math.abs(camera.project(v).depth)+2)));
      const triangles=[],lines=[];
      function vertex(out,p,c,bias=0){out.push(p.x/camera.width*2-1,1-p.y/camera.height*2,-p.depth/depth-bias,...c);}
      for(const box of boxes){
        const points=boxCorners(box).map(v=>camera.project(v)),base=rgb(box.color);
        for(const face of faces){const tint=base.map(n=>n*face.shade);for(const index of [0,1,2,0,2,3])vertex(triangles,points[face.v[index]],tint);}
        const outline=box.selected?[.84,.96,.77]:base.map(n=>Math.min(1,n*1.16));
        for(const edge of edges)for(const i of edge)vertex(lines,points[i],outline,.00005);
      }
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(triangles),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,triangles.length/6);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(lines),gl.DYNAMIC_DRAW);gl.drawArrays(gl.LINES,0,lines.length/6);
      ctx.drawImage(surface,0,0,camera.width,camera.height);return true;
    },
    destroy(){gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  };
}
// Keep a readable fallback when a browser disables graphics acceleration.
export function drawIsoFallback(ctx,boxes,camera){
  const polygons=[];
  for(const box of boxes){const points=boxCorners(box).map(v=>camera.project(v)),base=rgb(box.color);
    for(const face of faces){const p=face.v.map(i=>points[i]);polygons.push({p,depth:p.reduce((sum,v)=>sum+v.depth,0)/4,color:`rgb(${base.map(n=>Math.round(n*face.shade*255)).join(',')})`,stroke:box.selected?'#d6f5c4':box.color});}}
  polygons.sort((a,b)=>a.depth-b.depth);
  for(const face of polygons){ctx.beginPath();face.p.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=face.color;ctx.fill();ctx.strokeStyle=face.stroke;ctx.lineWidth=1;ctx.stroke();}
}
