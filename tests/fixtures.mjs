import {gzipSync} from 'node:zlib';
export function structureBytes(size,palette,blocks,compressed=false){
  const parts=[],byte=n=>parts.push(Buffer.from([n])),int=n=>{const b=Buffer.alloc(4);b.writeInt32BE(n);parts.push(b);},str=s=>{const b=Buffer.from(s),n=Buffer.alloc(2);n.writeUInt16BE(b.length);parts.push(n,b);};
  const type=v=>typeof v==='string'?8:typeof v==='boolean'?1:typeof v==='number'?3:Array.isArray(v)?9:10;
  function value(v,t=type(v)){
    if(t===8)str(v);else if(t===1)byte(v?1:0);else if(t===3)int(v);
    else if(t===9){const child=v.length?type(v[0]):10;byte(child);int(v.length);for(const item of v)value(item,child);}
    else{for(const [key,item] of Object.entries(v)){byte(type(item));str(key);value(item);}byte(0);}
  }
  byte(10);str('');value({DataVersion:3955,size,palette,blocks,entities:[]});
  const bytes=Buffer.concat(parts);return compressed?gzipSync(bytes):bytes;
}
export function doorFixture({size=[16,8,16],facing='west',pos=[0,4,5],width=6,height=4,security=true,access='TERMINAL',marker=true,count=width,modern=true,compressed=false,extras=[],half=false}={}){
  const palette=[{Name:'create:copycat_panel'},{Name:half?(security?'erosionsector:tile_security_door_drive':'erosionsector:tile_door_drive'):security?'erosionsector:security_door_drive':'erosionsector:door_drive',Properties:{facing}},{Name:'erosionsector:tile_door_part',Properties:{facing,sliding:String(security)}}];
  const blocks=[{pos:[Math.min(1,size[0]-1),0,Math.min(1,size[2]-1)],state:0,nbt:{Material:'minecraft:iron_block'}},...extras];
  if(marker)for(let i=0;i<count;i++){
    const at=[...pos];at[['north','south'].includes(facing)?0:2]+=i;
    blocks.push({pos:at,state:1,nbt:modern?{MarkerVersion:half?4:3,Width:width,Height:height,Required:true,...(half?{HalfReady:true,LocalRow:height-1}:{}),door_settings:{type:security?'SECURITY':'NORMAL',access,break_rule:'UNLOCKED',terminal_command:'UNLOCK LAB',noise_passes:true,light_passes:false}}:{}});
    if(half)for(let row=0;row<height-1;row++){const part=[...at];part[1]=pos[1]-height+1+row;blocks.push({pos:part,state:2,nbt:{Width:width,Height:height,LocalRow:row,HalfReady:true}});}
  }
  return structureBytes(size,palette,blocks,compressed);
}
