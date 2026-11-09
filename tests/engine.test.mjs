import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULT_PROFILE,normalizeProfile,evaluateProgram,evaluatePrograms,summarize,getPlanningSuggestions} from '../web/engine.js';
const data=JSON.parse(fs.readFileSync(new URL('../web/programs.json',import.meta.url),'utf8'));
const programs=data.programs;
const byId=Object.fromEntries(programs.map(p=>[p.id,p]));
const test=(id,profile)=>evaluateProgram(byId[id],{...DEFAULT_PROFILE,...profile});
let checks=0;function ok(value,message){assert.ok(value,message);checks++;}function eq(a,b,message){assert.deepEqual(a,b,message);checks++;}
const before=JSON.stringify(programs);
const cases=[2,3.49,3.5,3.749,3.75,3.99,4,4.1,4.249,4.25,4.299,4.3,4.374,4.375,4.499,4.5,5];
for(const gpa of cases){const results=evaluatePrograms(programs,{gpa});eq(results.length,152);eq(summarize(results).total,152);ok(results.every(r=>r.tier&&r.reasons.length&&r.nextSteps.length&&r.sources.length),'all records remain interpretable');}
eq(JSON.stringify(programs),before,'evaluation must not mutate source records');
for(const [id,min] of [['M009',4.25],['M007',4.5],['M051',4.3],['CN016',4.375],['M101',3.75],['M085',3.5],['M106',4]]){
 eq(test(id,{gpa:min-.001}).gpaGate.status,'below',`${id} just below`);
 eq(test(id,{gpa:min}).gpaGate.status,'met',`${id} at boundary`);
 ok(test(id,{gpa:min}).tier!=='成绩未达线',`${id} meets threshold`);
}
for(const id of ['M048','M049','M050','M002','M107','M079','M080','M130','M131','M132'])eq(test(id,{gpa:3.9}).gpaGate.status,'unknown',`${id} must not invent numeric threshold`);
eq(test('M002',{gpa:3.8}).gpaGate.minimum,null,'MIT3.9 fee waiver is not an admission minimum');
const strong={gpa:4.5,researchStage:'mechanism',independence:'lead',reproducibility:'controlled',characterization:'independent',recommendation:'specific',batteryOutputs:1,connections:{mit:'feedback',stanford:'feedback'}};
for(const id of ['M001','M002','M004'])eq(test(id,strong).tier,'冲刺中的冲刺','highest competition remains');
for(const id of ['M005','M006'])eq(test(id,strong).tier,'冲刺档','Stanford reach floor');
for(const id of ['M003','M017','M051','M108','M132'])eq(test(id,{...strong,gpa:5,prerequisitesConfirmed:true,researchAccess:'prepared'}).tier,'条件候选','structural conditions persist');
eq(test('M001',{gpa:4.5,greStatus:'valid',greScore:340}).tier,test('M001',{gpa:4.5,greStatus:'none',greScore:260}).tier,'not accepted GRE no rank boost');
eq(test('M001',{englishStatus:'moi-ready'}).languageStatus.status,'action-needed','MIT ChemE MOI not enough');
eq(test('M002',{englishStatus:'moi-ready'}).languageStatus.status,'moi-review','DMSE waiver request path distinct');
eq(test('M063',{greStatus:'planned'}).greEffect.status,'action-needed','Tokyo GRE planned incomplete');
eq(test('M063',{greStatus:'valid'}).greEffect.status,'document-ready','Tokyo formal GRE valid');
eq(test('M094',{}).greEffect.status,'not-weighted','not listed must not become not accepted inside a caution');
eq(test('M002',{}).greEffect.status,'not-considered','MIT explicit not accepted remains distinct');
for(const id of ['CN007','CN009','M101','M102','M119','M126','CN022'])ok(test(id,{greStatus:'planned'}).greEffect.status!=='action-needed',`${id} negative GRE wording must not become required`);
eq(evaluatePrograms(programs,DEFAULT_PROFILE).filter(r=>r.greEffect.status==='action-needed').map(r=>r.id).sort(),['M005','M051','M063','M064'],'only the4 verified mandatory GRE routes');
eq(test('M126',{gpa:2.89}).gpaGate.status,'guide-below','UNSW guide distinct');
eq(test('M126',{gpa:2.9}).gpaGate.status,'guide-met');
eq(test('M094',{}).researchMode,'substantial-project','UCL Chemical Research substantial project');
for(const id of ['M072','M073','M117'])eq(test(id,{}).researchMode,'project-or-optional','optional thesis route not guaranteed');
for(const id of ['M097','M098','M099','M100','M101','M102'])eq(test(id,{}).researchMode,'thesis','mandatory thesis routes recorded');
const base=test('M130',{gpa:4.5});const countOnly=test('M130',{gpa:4.5,batteryOutputs:20,researchStage:'accepted'});
eq(base.tier,countOnly.tier,'paper count without controlled evidence must not improve tier');
const enough=test('M130',strong);ok(enough.tier!==base.tier,'converging evidence can change suitable research route');
const methodBase=test('M043',{gpa:4.5});const methodStrong=test('M043',strong);eq(methodBase.tier,methodStrong.tier,'battery experiments not a substitute for methods preparation');
eq(evaluatePrograms(programs,{intendedDegree:'masters'}).length,129);eq(evaluatePrograms(programs,{intendedDegree:'direct-phd'}).length,23);
const plans=getPlanningSuggestions(DEFAULT_PROFILE,evaluatePrograms(programs,DEFAULT_PROFILE));eq(plans[0].id,'coursework');ok(plans.some(x=>x.id==='leadership'));ok(plans.some(x=>x.id==='recommendation'));ok(plans.every(x=>x.title&&x.why&&x.action));
eq(normalizeProfile(null).gpa,4.1);eq(normalizeProfile([]).gpa,4.1);eq(normalizeProfile('invalid').gpa,4.1);eq(normalizeProfile({gpa:Infinity}).gpa,4.1);eq(normalizeProfile({gpa:7}).gpa,5);eq(normalizeProfile({gpa:1}).gpa,2);eq(normalizeProfile({batteryOutputs:-2}).batteryOutputs,0);
console.log(JSON.stringify({checks,records:programs.length,gpaCases:cases.length,defaultSummary:summarize(evaluatePrograms(programs,DEFAULT_PROFILE)),strongSummary:summarize(evaluatePrograms(programs,strong))},null,2));
