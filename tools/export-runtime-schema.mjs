import {writeFile} from 'node:fs/promises';
import {BLOCKS} from '../dist/logic.mjs';
const json=JSON.stringify(BLOCKS,null,2)+'\n';
if(process.argv[2])await writeFile(process.argv[2],json);else process.stdout.write(json);
