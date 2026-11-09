import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/state'){res.writeHead(401,{'content-type':'application/json'});res.end('{"error":"authentication_required"}');return;}
  const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  if(name.includes('..')||name.includes('\\')){res.writeHead(404);res.end();return;}
  try{
    let body;
    try{body=await fs.readFile(path.join(root,'web',name));}catch{body=await fs.readFile(path.join(root,'dist',name));}
    res.writeHead(200,{'content-type':types[path.extname(name)]||'text/plain','cache-control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4318,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4318'));
