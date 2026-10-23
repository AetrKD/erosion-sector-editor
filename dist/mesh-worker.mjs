import {BlockModels,texturedMesh} from './block-models.mjs';
self.onmessage=({data:{root,data,cut}})=>{try{const mesh=texturedMesh(root,new BlockModels(data),cut);self.postMessage({mesh},mesh.groups.map(g=>g.vertices.buffer));}catch(error){self.postMessage({error:error.message});}};
