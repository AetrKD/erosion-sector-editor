import {readStructure} from './nbt.mjs';
self.onmessage=async e=>{try{const root=await readStructure(e.data.bytes);self.postMessage({id:e.data.id,root});}catch(error){self.postMessage({id:e.data.id,error:error.message});}};
