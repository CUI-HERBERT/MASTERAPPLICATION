import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {createAccessAuthorizer} from '../worker/access.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env={ACCESS_TEAM_DOMAIN:'https://unit-test.cloudflareaccess.com',ACCESS_AUD:'d'.repeat(64),ACCESS_OWNER_EMAIL:'owner@example.test'};
const now=Math.floor(Date.now()/1000);
const keyA=await generateKeyPair('RS256',{modulusLength:2048});
const keyB=await generateKeyPair('RS256',{modulusLength:2048});
const publicA={...await exportJWK(keyA.publicKey),kid:'key-a',alg:'RS256',use:'sig'};
const publicB={...await exportJWK(keyB.publicKey),kid:'key-b',alg:'RS256',use:'sig'};
async function token(overrides={},key=keyA.privateKey,kid='key-a'){
 const claims={type:'app',email:'owner@example.test',iss:env.ACCESS_TEAM_DOMAIN,aud:[env.ACCESS_AUD],sub:'owner-stable-subject',iat:now,exp:now+3600,...overrides};
 for(const name of Object.keys(claims))if(claims[name]===undefined)delete claims[name];
 return new SignJWT(claims).setProtectedHeader({alg:'RS256',kid}).sign(key);
}
function request(value,url='https://planner.example.test/',headers={}){
 return new Request(url,{headers:{...(value?{'cf-access-jwt-assertion':value}:{}),...headers}});
}
function fixture(initial=[publicA]){
 let keys=initial,calls=0;
 const fetchImplementation=async(url,options)=>{
  calls++;assert.equal(String(url),`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);assert.equal(options.redirect,'error');
  return Response.json({keys});
 };
 return{authorize:createAccessAuthorizer({fetchImplementation}),get calls(){return calls},setKeys(value){keys=value},fetchImplementation};
}

test('missing configuration or missing signed identity never trusts native identity headers',async()=>{
 const f=fixture();
 for(const cfg of [{},{...env,ACCESS_OWNER_EMAIL:''},{...env,ACCESS_AUD:''},{...env,ACCESS_TEAM_DOMAIN:'https://evil.test'},{...env,ACCESS_TEAM_DOMAIN:'https://unit-test.cloudflareaccess.com.evil.test'}]){
  const r=await f.authorize(request(null,undefined,{'oai-authenticated-user-id':'owner'}),cfg);
  assert.equal(r.status,503);
 }
 assert.equal((await f.authorize(request(null,undefined,{'oai-authenticated-user-id':'owner'}),env)).status,401);
 assert.equal(f.calls,0);
});

test('only verified sole-owner application identity rewrites the retained API identity',async()=>{
 const f=fixture(),signed=await token();
 const r=await f.authorize(request(signed,undefined,{'oai-authenticated-user-id':'forged-other-user','cf-access-authenticated-user-email':'intruder@example.test'}),env);
 assert.equal(r.identity.userId,'access:owner-stable-subject');
 assert.equal(r.request.headers.get('oai-authenticated-user-id'),'access:owner-stable-subject');
 assert.equal(r.request.headers.has('cf-access-authenticated-user-email'),false);
 const mixedCase=await f.authorize(request(await token({email:'OWNER@EXAMPLE.TEST'})),env);
 assert.equal(mixedCase.identity.email,'owner@example.test');
 assert.equal(f.calls,1);
});

test('invalid signature, issuer, audience, expiry, time or required claims fail closed',async()=>{
 const f=fixture();
 const cases=[{exp:now-60},{nbf:now+120},{iss:'https://other-team.cloudflareaccess.com'},{aud:['wrong-app']},{exp:undefined},{iat:undefined},{iat:now+120},{iat:now+3600},{email:undefined},{sub:''},{sub:'bad\nsubject'},{sub:undefined},{type:'org'},{type:undefined}];
 for(const claims of cases){const r=await f.authorize(request(await token(claims)),env);assert.equal(r.status,401,JSON.stringify(claims));}
 const wrongSignature=await f.authorize(request(await token({},keyB.privateKey,'key-a'),undefined,{'oai-authenticated-user-id':'access:owner-stable-subject'}),env);
 assert.equal(wrongSignature.status,401);
 const outsider=await f.authorize(request(await token({email:'someone-else@example.test'})),env);assert.equal(outsider.status,403);
 const serviceToken=await f.authorize(request(await token({sub:'',email:undefined,common_name:'service-client'})),env);assert.equal(serviceToken.status,401);
 for(const malformed of ['not-a-token','a.b.c','x'.repeat(17000)])assert.equal((await f.authorize(request(malformed),env)).status,401);
 const none=`${Buffer.from(JSON.stringify({alg:'none',kid:'key-a'})).toString('base64url')}.${Buffer.from('{}').toString('base64url')}.`;
 assert.equal((await f.authorize(request(none),env)).status,401);
});

test('cached keys are bounded by age; rotated unknown key refreshes only after cooldown',async()=>{
 const f=fixture();
 assert.ok((await f.authorize(request(await token()),env)).identity);
 assert.ok((await f.authorize(request(await token()),env)).identity);assert.equal(f.calls,1);
 f.setKeys([publicA,publicB]);
 assert.equal((await f.authorize(request(await token({},keyB.privateKey,'key-b')),env)).status,401);assert.equal(f.calls,1);
 const realNow=Date.now;
 try{
  Date.now=()=>realNow()+31000;
  assert.ok((await f.authorize(request(await token({},keyB.privateKey,'key-b')),env)).identity);assert.equal(f.calls,2);
  Date.now=()=>realNow()+332000;
  assert.ok((await f.authorize(request(await token()),env)).identity);assert.equal(f.calls,3);
 }finally{Date.now=realNow;}
});

test('certificate failure does not return identity, claims or tokens in error responses',async()=>{
 const value=await token();
 for(const fetchImplementation of [async()=>{throw new Error(`private-network-details ${value}`)},async()=>new Response('bad',{status:500}),async()=>Response.json({keys:[]})]){
  const r=await createAccessAuthorizer({fetchImplementation})(request(value),env);
  assert.equal(r.status,401);assert.equal(await r.text(),'{"error":"authentication_required"}');
  assert.equal(r.headers.get('cache-control'),'no-store');
 }
});

test('bundled Worker protects every asset/API and retains authenticated cloud round trips',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,stdio:'pipe'});
 const worker=(await import(pathToFileURL(path.join(root,'dist/server/index.js')))).default;
 for(const resource of ['/','/app.js','/portfolio-seed.json','/programs.json','/api/state','/unknown']){
  const r=await worker.fetch(request(null,`https://planner.example.test${resource}`,{'oai-authenticated-user-id':'access:owner-stable-subject'}),env);
  assert.equal(r.status,401,resource);assert.ok(!(await r.text()).includes('seed-paper-'));
 }
 const originalFetch=globalThis.fetch,f=fixture();
 globalThis.fetch=f.fetchImplementation;
 try{
  const signed=await token();
  const seed=await worker.fetch(request(signed,'https://planner.example.test/portfolio-seed.json'),env);
  assert.equal(seed.status,200);assert.equal(seed.headers.get('cache-control'),'no-store');assert.equal((await seed.json()).items.length,24);
  assert.equal((await worker.fetch(request(signed,'https://planner.example.test/api/state'),env)).status,503);
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(root,'drizzle/0000_planner_state.sql'),'utf8'));
  const DB={prepare(sql){return{bind(...values){return{async first(){return db.prepare(sql).get(...values)||null},async run(){return{meta:{changes:Number(db.prepare(sql).run(...values).changes)}}}}}}}};
  const url='https://planner.example.test/api/state';
  const state={schemaVersion:1,profile:{gpa:4.37},portfolio:{schemaVersion:1,items:[{id:'my-paper',category:'paper',title:'用户修改后的论文'}],deletedIds:['seed-paper-ef-rul']},favorites:['M002']};
  const save=await worker.fetch(new Request(url,{method:'PUT',headers:{'cf-access-jwt-assertion':signed,'oai-authenticated-user-id':'forged-id','content-type':'application/json',origin:'https://planner.example.test'},body:JSON.stringify({state,version:0})}),{...env,DB});
  assert.equal(save.status,200);
  const restored=await (await worker.fetch(request(signed,url),{...env,DB})).json();
  assert.deepEqual(restored.state,state);assert.equal(restored.version,1);
  assert.equal(db.prepare('SELECT user_id FROM planner_state').get().user_id,'access:owner-stable-subject');
  const denied=await worker.fetch(request(await token({email:'other@example.test'}),url),{...env,DB});assert.equal(denied.status,403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM planner_state').get().n,1);
 }finally{globalThis.fetch=originalFetch;}
});
