import {unzipSync} from './vendor/fflate.mjs';
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
self.onmessage=async({data:{source}})=>{try{
 const url=new URL(source.url);if(url.protocol!=='https:'||!['cdn.modrinth.com','piston-data.mojang.com'].includes(url.hostname))throw Error('지원하지 않는 공식 리소스 주소');
 self.postMessage({progress:source.label+' 리소스 받는 중…'});const response=await fetch(url);if(!response.ok)throw Error(source.file+' 다운로드 실패 · '+response.status);const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==source.size||bytes.length>80*1024*1024)throw Error(source.file+' 크기가 일치하지 않습니다.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==source.sha256)throw Error(source.file+' 검증에 실패했습니다.');
 self.postMessage({progress:source.label+' 미리보기 준비 중…'});let expanded=0;
 const files=unzipSync(bytes,{filter:f=>{const use=/^assets\/[^/]+\/(blockstates\/.*\.json|models\/.*\.json|textures\/.*\.(png|mcmeta))$/.test(f.name);if(use){expanded+=f.originalSize;if(expanded>96*1024*1024||f.originalSize>8*1024*1024)throw Error('리소스 크기 한도 초과');}return use;}});
 const pack={data:{version:1,states:{},models:{},textures:{},pages:[]},atlases:[]};const extra=new Set();
 for(const[name,raw]of Object.entries(files)){const bits=name.split('/'),ns=bits[1],type=bits[2],tail=bits.slice(3).join('/');if(!name.endsWith('.json')||!['models','blockstates'].includes(type))continue;
  const key=ns+':'+tail.slice(0,-5);const value=JSON.parse(decode(raw));if(type==='blockstates')pack.data.states[key]=value;else if(tail.startsWith('block/')){pack.data.models[key]=value;for(const v of Object.values(value.textures||{}))if(typeof v==='string'&&!v.startsWith('#'))extra.add(v.includes(':')?v:ns+':'+v);}
 }
 const images=[];let area=0,maxDimension=0;
 for(const[name,raw]of Object.entries(files)){if(!name.endsWith('.png'))continue;const bits=name.split('/'),key=bits[1]+':'+bits.slice(3).join('/').slice(0,-4);if(!name.includes('/textures/block/')&&!extra.has(key))continue;
  const im=await createImageBitmap(new Blob([raw],{type:'image/png'}));let width=im.width,height=im.height,sx=0,sy=0;const meta=files[name+'.mcmeta'];if(meta){const anim=JSON.parse(decode(meta)).animation;if(anim){width=anim.width||im.width;height=anim.height||width;let frame=anim.frames?.[0]||0;frame=typeof frame==='object'?frame.index:frame;sx=(frame%Math.max(1,Math.floor(im.width/width)))*width;sy=Math.floor(frame/Math.max(1,Math.floor(im.width/width)))*height;}}
  if(width>4094||height>4094){im.close();continue;}images.push({key,im,width,height,sx,sy});area+=(width+2)*(height+2);maxDimension=Math.max(maxDimension,width+2,height+2);
 }
 images.sort((a,b)=>b.height-a.height);const size=Math.min(4096,2**Math.ceil(Math.log2(Math.max(256,maxDimension,Math.sqrt(area*1.5)))));let canvas=new OffscreenCanvas(size,size),ctx=canvas.getContext('2d'),x=0,y=0,row=0,page=0;
 const flush=async()=>{pack.atlases.push(await canvas.convertToBlob({type:'image/png'}));pack.data.pages.push('auto-'+hash.slice(0,16)+'-'+page+'.png');page++;if(page>8)throw Error('텍스처 페이지 한도 초과');canvas=new OffscreenCanvas(size,size);ctx=canvas.getContext('2d');};
 for(const image of images){const{key,im,width:w,height:h,sx,sy}=image;if(x+w+2>size){x=0;y+=row;row=0;}if(y+h+2>size){await flush();x=0;y=row=0;}ctx.drawImage(im,sx,sy,w,h,x+1,y+1,w,h);im.close();pack.data.textures[key]={page,x:x+1,y:y+1,w,h,size};x+=w+2;row=Math.max(row,h+2);}
 await flush();self.postMessage({pack});
}catch(e){self.postMessage({error:e.message});}};
