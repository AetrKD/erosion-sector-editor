import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const types = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if(pathname==='/api/records'||pathname==='/api/clears'){
      let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>16384){response.writeHead(413);response.end('Record too large');return;}chunks.push(chunk);}request.body=Buffer.concat(chunks).toString('utf8');
      response.status=function(code){this.statusCode=code;return this;};response.json=function(value){this.setHeader('Content-Type','application/json');this.end(JSON.stringify(value));return this;};
      const {default:handler}=await import('.'+pathname+'.js');await handler(request,response);return;
    }
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname+'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    const data = await readFile(file);
    response.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    response.end(data);
  } catch { response.writeHead(404); response.end('Not found'); }
});
const port=Number(process.env.PORT||4173);server.listen(port, '127.0.0.1', () => console.log('Local: http://127.0.0.1:'+port));
