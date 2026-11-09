import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleState,validateState} from '../worker/api.mjs';
import {normalizePortfolio,removePortfolioItem,upsertPortfolioItem} from '../web/portfolio.js';

function database(){
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../drizzle/0000_planner_state.sql',import.meta.url),'utf8'));
  return {prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)||null},async run(){const r=db.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}}}}}}};
}
function request(user,method='GET',body=null,extra={}){
  return new Request('https://planner.example/api/state',{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),'content-type':'application/json',origin:'https://planner.example',...extra},...(body?{body:JSON.stringify(body)}:{})});
}
const state={profile:{gpa:4.1,researchStage:'ongoing'},favorites:['M001'],scenarios:[],tasks:[]};

test('unauthenticated requests fail before storage access',async()=>{
  const r=await handleState(request(null),{});assert.equal(r.status,401);
});
test('D1 missing reports unavailable; no false saved state',async()=>{
  assert.equal((await handleState(request('alice'),{})).status,503);
});
test('schema migration, save/reload, isolation and stale-version prevention',async()=>{
  const env={DB:database()};
  assert.deepEqual(await (await handleState(request('alice'),env)).json(),{state:null,version:0,updatedAt:null});
  const first=await handleState(request('alice','PUT',{state,version:0}),env);assert.equal(first.status,200);assert.equal((await first.json()).version,1);
  const saved=await (await handleState(request('alice'),env)).json();assert.equal(saved.state.profile.gpa,4.1);assert.equal(saved.version,1);
  assert.equal((await (await handleState(request('bob'),env)).json()).state,null);
  const stale=await handleState(request('alice','PUT',{state:{...state,profile:{gpa:4.8}},version:0}),env);assert.equal(stale.status,409);
  assert.equal((await (await handleState(request('alice'),env)).json()).state.profile.gpa,4.1);
  const next=await handleState(request('alice','PUT',{state:{...state,profile:{gpa:4.5}},version:1}),env);assert.equal((await next.json()).version,2);
  assert.equal((await (await handleState(request('alice'),env)).json()).state.profile.gpa,4.5);
  assert.equal((await handleState(request('bob','PUT',{state,version:0}),env)).status,200);
  assert.equal((await (await handleState(request('bob'),env)).json()).version,1);
});
test('reject unsupported methods, cross-origin writes and invalid GPA',async()=>{
  const env={DB:database()};
  assert.equal((await handleState(request('alice','DELETE'),env)).status,405);
  assert.equal((await handleState(request('alice','PUT',{state,version:0},{origin:'https://other.example'}),env)).status,403);
  for(const gpa of [0,1.99,5.01,'not-a-number',null]){
    const r=await handleState(request('alice','PUT',{state:{profile:{gpa}},version:0}),env);assert.equal(r.status,400);
  }
  assert.equal((await handleState(request('alice','PUT',{state,version:-1}),env)).status,400);
});
test('reject dangerous imported object keys and excessive snapshots',async()=>{
  assert.equal(validateState(JSON.parse('{"profile":{"gpa":4.1},"__proto__":{"admin":true}}')),false);
  assert.equal(validateState({profile:{gpa:4.1},notes:'x'.repeat(21000)}),false);
  const env={DB:database()};
  const large={profile:{gpa:4.1},scenarios:Array.from({length:70},()=>({notes:'x'.repeat(16000)}))};
  assert.equal((await handleState(request('alice','PUT',{state:large,version:0}),env)).status,413);
});
test('portfolio migration, edited contribution and deletion survive cloud reload',async()=>{
 const env={DB:database()};
 const seed={seedVersion:1,items:[{id:'seed-paper',category:'paper',title:'论文',status:'在审'},{id:'seed-award',category:'award',title:'获奖记录'}]};
 await handleState(request('alice','PUT',{state,version:0}),env);
 const old=await (await handleState(request('alice'),env)).json();
 let portfolio=normalizePortfolio(old.state.portfolio,seed);
 portfolio=upsertPortfolioItem(portfolio,{...portfolio.items[0],contribution:'修订后的具体贡献',status:'已接收'});
 portfolio=removePortfolioItem(portfolio,'seed-award');
 const saved={...old.state,portfolio};
 assert.equal((await handleState(request('alice','PUT',{state:saved,version:old.version}),env)).status,200);
 const latest=await (await handleState(request('alice'),env)).json();
 assert.deepEqual(latest.state.profile,old.state.profile);assert.deepEqual(latest.state.favorites,old.state.favorites);
 const restored=normalizePortfolio(latest.state.portfolio,seed);
 assert.equal(restored.items.length,1);assert.equal(restored.items[0].contribution,'修订后的具体贡献');
 assert.ok(restored.deletedIds.includes('seed-award'));assert.equal(latest.version,2);
});
