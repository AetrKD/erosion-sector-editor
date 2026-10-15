// Bit indices are x + size.x * (z + size.z * y), in schematic-local block coordinates.
const decoded=new WeakMap();
export const AIR=new Set(['minecraft:air','minecraft:cave_air','minecraft:void_air','minecraft:structure_void']);
export function encodeOccupancy(size,positions){
  const bits=new Uint8Array(Math.ceil(size.x*size.y*size.z/8));let count=0;
  for(const [x,y,z] of positions){const i=x+size.x*(z+size.z*y),mask=1<<(i&7);if(!(bits[i>>3]&mask)){bits[i>>3]|=mask;count++;}}
  let text='';for(let i=0;i<bits.length;i+=8192)text+=String.fromCharCode(...bits.subarray(i,i+8192));
  return {encoding:'bitset-v1',bits:btoa(text),count};
}
export function occupancy(tile){
  const mask=tile.asset?.occupancy;if(!mask)return null;
  if(decoded.has(mask))return decoded.get(mask);
  const text=atob(mask.bits),bits=Uint8Array.from(text,c=>c.charCodeAt(0));
  if(mask.encoding!=='bitset-v1'||bits.length!==Math.ceil(tile.size.x*tile.size.y*tile.size.z/8))throw new Error('설계도 블록 점유 데이터가 올바르지 않습니다.');
  decoded.set(mask,bits);return bits;
}
function solid(tile,bits,x,y,z,rotation){
  let ix=x,iz=z;
  if(rotation===90){ix=z;iz=tile.size.z-1-x;}
  else if(rotation===180){ix=tile.size.x-1-x;iz=tile.size.z-1-z;}
  else if(rotation===270){ix=tile.size.x-1-z;iz=x;}
  if(!bits)return true; // Design-only tiles reserve their whole bounding volume.
  const i=ix+tile.size.x*(iz+tile.size.z*y);return !!(bits[i>>3]&(1<<(i&7)));
}
/** Returns the first conflicting world block, or null. Bounds must already include yaw rotation. */
export function conflictingBlock(tile,a,boxA,other,b,boxB){
  const minX=Math.max(boxA.x,boxB.x),minY=Math.max(boxA.y,boxB.y),minZ=Math.max(boxA.z,boxB.z);
  const maxX=Math.min(boxA.x+boxA.dx,boxB.x+boxB.dx),maxY=Math.min(boxA.y+boxA.dy,boxB.y+boxB.dy),maxZ=Math.min(boxA.z+boxA.dz,boxB.z+boxB.dz);
  if(minX>=maxX||minY>=maxY||minZ>=maxZ)return null;
  const aa=occupancy(tile),bb=occupancy(other);
  if(!aa&&!bb)return {x:minX,y:minY,z:minZ};
  for(let y=minY;y<maxY;y++)for(let z=minZ;z<maxZ;z++)for(let x=minX;x<maxX;x++)
    if(solid(tile,aa,x-boxA.x,y-boxA.y,z-boxA.z,a.rotation)&&solid(other,bb,x-boxB.x,y-boxB.y,z-boxB.z,b.rotation))return {x,y,z};
  return null;
}
