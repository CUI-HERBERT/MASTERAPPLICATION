import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_PROFILE, evaluateProgram } from '../web/engine.js';
import { buildProgramGapAnalysis, summarizePortfolio } from '../web/gaps.js';

const programs=JSON.parse(fs.readFileSync(new URL('../web/programs.json',import.meta.url),'utf8')).programs;
const byId=Object.fromEntries(programs.map(p=>[p.id,p]));
const analyse=(id,profile={},items=[])=>buildProgramGapAnalysis(byId[id],{...DEFAULT_PROFILE,...profile},items);
const gap=(result,id)=>result.gaps.find(g=>g.id===id);
const mature={gpa:4.5,researchStage:'mechanism',independence:'lead',reproducibility:'controlled',characterization:'independent',recommendation:'specific'};
const paper={id:'p1',category:'paper',title:'Battery experiment',organization:'Journal',role:'第一作者',status:'已接受',contribution:'负责研究问题、关键对照及独立重复并解释主要表征。',relevance:'battery-experimental'};

test('all 152 analyses retain programme-specific requirements without mutating input',()=>{
  const before=JSON.stringify(programs);
  for(const p of programs){
    const result=buildProgramGapAnalysis(p,DEFAULT_PROFILE,[]);
    assert.equal(result.uplift.currentTier,evaluateProgram(p,DEFAULT_PROFILE).tier);
    assert.ok(result.gaps.length>=8);
    assert.equal(gap(result,'prerequisites').target.startsWith(p.prerequisites),true,p.id);
    assert.ok(gap(result,'route').target.includes(p.supervisor),p.id);
    assert.ok(result.uplift.conditions.length);
    assert.ok(result.gaps.every(g=>['complete','missing','to-confirm','developing','not-applicable'].includes(g.status)),p.id);
    assert.ok(result.gaps.every(g=>g.target&&g.current&&g.impact&&g.checked),p.id);
    assert.match(result.notice,/未随背景输入实时联网更新/);
  }
  assert.equal(JSON.stringify(programs),before);
});

test('official GPA line is distinct from personal4.5 goal and absent thresholds stay absent',()=>{
  const cambridge=analyse('M009');
  assert.equal(gap(cambridge,'gpa').status,'missing');
  assert.match(gap(cambridge,'gpa').target,/官方已核参考 4.25/);
  assert.match(gap(cambridge,'gpa').target,/4.50不是新增的官方门槛/);
  assert.equal(gap(analyse('M009',{gpa:4.25}),'gpa').status,'complete');
  const oxford=analyse('M026',{gpa:4.1});
  assert.equal(gap(oxford,'gpa').status,'complete');
  const mit=analyse('M002');
  assert.equal(gap(mit,'gpa').status,'to-confirm');
  assert.doesNotMatch(gap(mit,'gpa').target,/3.9/);
  assert.match(gap(mit,'gpa').impact,/无官方NUS数字线不表示没有学业要求/);
  assert.match(gap(analyse('M126'),'gpa').impact,/工具仅供指导/);
});

test('GRE not accepted, required, optional, and not-listed remain distinct',()=>{
  const mit=gap(analyse('M001',{greStatus:'valid',greScore:340}),'gre');
  assert.equal(mit.status,'not-applicable');
  assert.match(mit.impact,/不考虑GRE/);
  const stanford=gap(analyse('M005'),'gre');
  assert.equal(stanford.status,'missing');
  assert.match(stanford.current,/计划成绩，尚未取得/);
  assert.equal(gap(analyse('M005',{greStatus:'valid'}),'gre').status,'to-confirm');
  const eth=gap(analyse('M051'),'gre');
  assert.match(eth.target,/AW4.5/);
  assert.match(eth.target,/Q\/V\/AW/);
  const ucl=gap(analyse('M094'),'gre');
  assert.equal(ucl.status,'to-confirm');
  assert.match(ucl.target,/未列不等于不接受/);
  assert.equal(gap(analyse('M004'),'gre').status,'not-applicable');
});

test('MOI ready and valid test lack automatic confirmation of every programme',()=>{
  assert.equal(gap(analyse('M001',{englishStatus:'moi-ready'}),'language').status,'missing');
  assert.equal(gap(analyse('M002',{englishStatus:'moi-ready'}),'language').status,'to-confirm');
  assert.equal(gap(analyse('M002',{englishStatus:'valid'}),'language').status,'to-confirm');
  assert.equal(gap(analyse('M002',{programEvidence:{M002:{language:'confirmed'}}}),'language').status,'complete');
});

test('portfolio edits change research evidence; titles/counts/status guesses do not improve tier',()=>{
  const base=analyse('M130');
  const accepted=analyse('M130',{},[paper]);
  assert.equal(accepted.evidenceSummary.acceptedExperimentalCount,1);
  assert.equal(accepted.evidenceSummary.acceptedExperimentalLeadCount,1);
  assert.match(gap(accepted,'research').current,/电池实验论文1篇/);
  assert.equal(base.uplift.currentTier,accepted.uplift.currentTier);
  assert.equal(analyse('M130',{},Array.from({length:100},(_,n)=>({...paper,id:`p${n}`}))).uplift.currentTier,base.uplift.currentTier);
  const pending=analyse('M130',{},[{...paper,status:'审稿中'}]);
  assert.equal(pending.evidenceSummary.acceptedExperimentalCount,0);
  const expected=analyse('M130',{},[{...paper,status:'预计接受一区'}]);
  assert.equal(expected.evidenceSummary.acceptedExperimentalCount,0);
  assert.equal(summarizePortfolio([{...paper,status:'已发表/接受'}]).acceptedExperimentalCount,0);
  assert.equal(summarizePortfolio([{...paper,role:'第五作者'}]).acceptedExperimentalLeadCount,0);
  assert.equal(summarizePortfolio([{...paper,contribution:''}]).acceptedExperimentalLeadCount,0);
  assert.equal(summarizePortfolio([{...paper,relevance:'battery-ml'}]).acceptedExperimentalCount,0);
  assert.equal(summarizePortfolio([{...paper,title:'待补充论文题目'}]).paperCount,0);
  assert.equal(summarizePortfolio(null).paperCount,0);
});

test('recommendation candidate, promised, formed, direct supervision remain separate',()=>{
  const promised={id:'r1',category:'recommender',title:'朱老师',role:'当前科研导师',status:'已承诺强推',contribution:'直接指导电池实验与独立课题研究',evidence:'研究摘要'};
  const generic={id:'r2',category:'recommender',title:'知名教授',role:'顾问',status:'可联系',contribution:'无直接科研指导',evidence:''};
  const p=summarizePortfolio([promised,generic]);
  assert.equal(p.recommenderCount,2);
  assert.equal(p.directKnowledgeCount,1);
  assert.equal(p.formedLetterCount,0);
  assert.equal(gap(analyse('M002',{},[promised,generic]),'recommendations').status,'developing');
  const ready=Array.from({length:3},(_,n)=>({...promised,id:`r${n}`,status:'推荐信已完成'}));
  assert.equal(gap(analyse('M002',{recommendation:'specific'},ready),'recommendations').status,'complete');
  const genericLetters=Array.from({length:3},(_,n)=>({...generic,id:`g${n}`,status:'推荐信已完成'}));
  assert.equal(gap(analyse('M002',{recommendation:'specific'},genericLetters),'recommendations').status,'developing');
  const before=gap(analyse('M002',{},[promised]),'recommendations').current;
  const after=gap(analyse('M002',{},[{...promised,title:'已修改姓名'}]),'recommendations').current;
  assert.notEqual(before,after);
});

test('pending names do not erase real relationship candidates or create completed letters',()=>{
  const seed=JSON.parse(fs.readFileSync(new URL('../web/portfolio-seed.json',import.meta.url),'utf8'));
  const summary=summarizePortfolio(seed.items);
  assert.equal(summary.recommenderCount,6);
  assert.equal(summary.namedRecommenderCount,1);
  assert.equal(summary.unnamedRecommenderCount,5);
  assert.equal(summary.formedLetterCount,0);
  assert.equal(summary.directKnowledgeCount,3,'default direct knowledge is Zhu, long-term supervisor, and former battery teacher');
  const dean=seed.items.find(i=>i.id==='seed-recommender-jiangsu-dean');
  assert.equal(summarizePortfolio([dean]).directKnowledgeCount,0,'unprovided dean relationship must not become direct guidance');
  for(const id of ['seed-recommender-zhu','seed-recommender-longterm-cheme','seed-recommender-jiangsu-battery']){
    assert.equal(summarizePortfolio([seed.items.find(i=>i.id===id)]).directKnowledgeCount,1,id);
  }
  const pending={id:'r-pending',category:'recommender',title:'长期指导的化工教授（姓名待补）',organization:'高校待补',role:'长期指导者',status:'推荐信已完成',contribution:'长期指导过独立研究及科研决策',evidence:'研究摘要'};
  assert.equal(summarizePortfolio([pending]).recommenderCount,1);
  assert.equal(summarizePortfolio([pending]).formedLetterCount,0);
  assert.equal(summarizePortfolio([{...pending,title:'待补充'}]).recommenderCount,0);
  const current=gap(analyse('M051',{},seed.items),'recommendations').current;
  assert.match(current,/已登记6位候选推荐人/);
  assert.match(current,/姓名已填写1位、姓名待补5位/);
});

test('gap source attribution is field-specific only when a suitable source exists',()=>{
  const eth=analyse('M051');
  assert.match(gap(eth,'language').source,/language-requirements/);
  assert.equal(gap(eth,'language').sourceLabel,'语言政策来源');
  for(const id of ['gre','prerequisites']){
    assert.doesNotMatch(gap(eth,id).source,/minimum-grade/);
    assert.equal(gap(eth,id).sourceLabel,'项目来源（合并核对）');
    assert.deepEqual(gap(eth,id).sources,byId.M051.sources);
  }
  assert.equal(gap(eth,'route').basis,'planning');
});

test('research evidence and programme type give different targets',()=>{
  assert.match(gap(analyse('M001'),'research').target,/不要求你另凑实验论文/);
  assert.match(gap(analyse('M130'),'research').target,/关键对照—独立重复—表征/);
  assert.equal(gap(analyse('M130',mature),'research').status,'complete');
  assert.match(gap(analyse('M130',{independence:'support'}),'research').current,/目前主要执行部分任务/);
  assert.doesNotMatch(gap(analyse('M130',{independence:'support'}),'research').current,/已主导/);
  const methods=analyse('M019');
  assert.match(gap(methods,'research').target,/训练\/测试隔离/);
  assert.match(gap(methods,'prerequisites').impact,/应用型ML文章不能自动替代/);
  assert.equal(gap(analyse('M130',{prerequisitesConfirmed:true}),'prerequisites').status,'to-confirm');
  assert.equal(gap(analyse('M130',{programEvidence:{M130:{prerequisites:'confirmed'}}}),'prerequisites').status,'complete');
});

test('uplift counterfactual respects elite and structural limits',()=>{
  for(const id of ['M001','M002','M004'])assert.equal(analyse(id,mature).uplift.potentialTier,'冲刺中的冲刺');
  for(const id of ['M005','M006'])assert.equal(analyse(id,mature).uplift.potentialTier,'冲刺档');
  for(const id of ['M003','M008','M051','M132']){
    const r=analyse(id,mature);
    assert.equal(r.uplift.potentialTier,'条件候选');
    assert.match(r.uplift.summary,/结构|资格|席位/);
    assert.ok(r.uplift.conditions.some(s=>/结构条件/.test(s)));
  }
  const cam=analyse('M009');
  assert.equal(cam.uplift.currentTier,'成绩未达线');
  assert.notEqual(cam.uplift.potentialTier,'成绩未达线');
  assert.ok(cam.uplift.conditions.some(s=>/4.50/.test(s)));
  assert.match(cam.uplift.summary,/情景/);
  assert.equal(analyse('M130',{gpa:4.8}).uplift.targetGpa,4.8);
  const ethBelow=analyse('M051',{gpa:4.1});
  assert.equal(ethBelow.uplift.currentTier,'成绩未达线');
  assert.equal(ethBelow.uplift.potentialTier,'条件候选');
  assert.match(ethBelow.uplift.summary,/当前成绩低于已核4.3/);
  assert.match(ethBelow.uplift.summary,/达到成绩参考后仍有结构或资格条件/);
});
