import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const web=path.join(root,'web');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const assets={};
for(const name of await fs.readdir(web)){
  if(!(path.extname(name)in types))continue;
  assets[`/${name}`]={body:await fs.readFile(path.join(web,name),'utf8'),type:types[path.extname(name)]};
}
for(const required of ['/index.html','/engine.js','/programs.json','/portfolio.js','/portfolio-seed.json','/gaps.js'])if(!assets[required])throw new Error(`Missing browser asset: ${required}`);
const dataset=JSON.parse(assets['/programs.json'].body);
if(dataset.programs.length!==152||new Set(dataset.programs.map(p=>p.id)).size!==152)throw new Error('Unexpected programme dataset');
// All assets are embedded behind the same auth handler. Do not configure a
// separate public static-assets binding or a GitHub Pages deployment.
const entry=`import {handleState} from './worker/api.mjs';
import {authorizeRequest} from './worker/access.mjs';
const ASSETS=${JSON.stringify(assets)};
export default {async fetch(request,env){
  try{
    const authorized=await authorizeRequest(request,env);
    if(authorized instanceof Response)return authorized;
    const trustedRequest=authorized.request;
    const url=new URL(trustedRequest.url);
    if(url.pathname==='/api/state')return await handleState(trustedRequest,env);
    if(!['GET','HEAD'].includes(trustedRequest.method))return new Response('Method not allowed',{status:405,headers:{'cache-control':'no-store'}});
    const asset=ASSETS[url.pathname==='/'?'/index.html':url.pathname];
    if(!asset)return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
    return new Response(trustedRequest.method==='HEAD'?null:asset.body,{headers:{'content-type':asset.type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
  }catch{
    return new Response(JSON.stringify({error:'service_unavailable'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
  }
}};
`;
await fs.mkdir(path.join(root,'dist/server'),{recursive:true});
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'worker-generated.mjs',loader:'js'},outfile:path.join(root,'dist/server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'eof',logLevel:'warning'});
const output=await fs.stat(path.join(root,'dist/server/index.js'));
console.log(JSON.stringify({assets:Object.keys(assets).length,programs:dataset.programs.length,bytes:output.size,authentication:'Cloudflare Access; every route'}));
