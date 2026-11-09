import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePortfolio,createPortfolioItem,upsertPortfolioItem,removePortfolioItem,summarizePortfolio} from '../web/portfolio.js';
import {validateState} from '../worker/api.mjs';

const row=(id,title='原始记录')=>({id,category:'paper',title,status:'在审',verification:'user-confirmed',relevance:'battery-ml'});
const seed={schemaVersion:1,seedVersion:1,items:[row('seed-paper-a'),{...row('seed-award','SPUR 正式入选'),category:'award',status:'已入选，长期进行中'}]};
test('old snapshots acquire seed without touching existing application state',()=>{
 const old={profile:{gpa:4.27},favorites:['M007'],tasks:[{id:'x',done:true}]};
 const snapshot=JSON.stringify(old);const portfolio=normalizePortfolio(old.portfolio,seed);
 assert.equal(portfolio.items.length,2);assert.equal(JSON.stringify(old),snapshot);
 assert.ok(validateState({...old,portfolio}));
});
test('edits, additions and explicit deletion survive seed merge and JSON backup',()=>{
 let p=normalizePortfolio(undefined,seed);
 p=upsertPortfolioItem(p,{...p.items[0],title:'用户修订的题名',status:'已发表'});
 const added={...createPortfolioItem('internship'),title:'新的实习'};p=upsertPortfolioItem(p,added);
 p=removePortfolioItem(p,'seed-award');
 const restored=normalizePortfolio(JSON.parse(JSON.stringify(p)),seed);
 assert.equal(restored.items.find(i=>i.id==='seed-paper-a').title,'用户修订的题名');
 assert.ok(restored.items.find(i=>i.id===added.id));assert.ok(!restored.items.find(i=>i.id==='seed-award'));
 assert.equal(restored.deletedIds.includes('seed-award'),true);
 assert.deepEqual(normalizePortfolio(restored,seed),restored);
 const updated=normalizePortfolio(restored,{...seed,seedVersion:2,items:[...seed.items,row('seed-new')]});
 assert.equal(updated.seedVersion,2);assert.equal(updated.items.length,3);assert.equal(updated.items[0].title,'用户修订的题名');
});
test('validation strips untrusted object fields and never renders title as code',()=>{
 const input=JSON.parse('{"id":"item-safe","category":"recommender","title":"<img src=x onerror=alert(1)>","verification":"bad","relevance":"unknown","__proto__":{"polluted":1}}');
 const result=normalizePortfolio({items:[input,input,{id:'constructor',category:'paper',title:'bad'},{id:'x',category:'__proto__',title:'bad'}]});
 assert.equal(result.items.length,1);assert.equal(result.items[0].verification,'to-confirm');
 assert.equal(result.items[0].relevance,'other');assert.equal(Object.hasOwn(result.items[0],'__proto__'),false);
 assert.equal({}.polluted,undefined);assert.match(result.items[0].title,/<img/);
 assert.throws(()=>upsertPortfolioItem(result,{...createPortfolioItem('paper'),title:' '}),/请填写/);
});
test('categories and status counts do not turn goals or selected fellowships into accepted papers',()=>{
 const p=normalizePortfolio({items:[row('a'),{...row('b'),status:'预计一区，将投稿'},{...row('c'),status:'已发表（材料核对）'},{...row('d'),status:'未接收'},{...row('e'),category:'award',status:'已入选'}]});
 const summary=summarizePortfolio(p);assert.equal(summary.counts.paper,4);assert.equal(summary.publishedPapers,1);assert.equal(summary.activePapers,1);
 assert.equal(summary.total,5);assert.equal(summary.counts.award,1);
});
