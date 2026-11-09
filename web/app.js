import * as engine from './engine.js';
import { normalizePortfolio, createPortfolioItem, upsertPortfolioItem, removePortfolioItem, summarizePortfolio, PORTFOLIO_CATEGORIES } from './portfolio.js';
import { buildProgramGapAnalysis } from './gaps.js';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const STORAGE_KEY = 'grad-pathway-planner-v1';
const STATUSES = ['未开始','了解中','准备材料','已提交','已获录取','不再申请'];
const TIERS = engine.TIER_ORDER || ['冲刺中的冲刺','冲刺档','主申一档','主申二档','较稳备选','条件候选','成绩未达线'];
const DEFAULT = clone(engine.DEFAULT_PROFILE || engine.defaultProfile);
const validEnum = {
  coreTrend:['rising','stable','falling','unknown'], researchStage:['in-progress','repeatable','mechanism','manuscript','accepted'],
  independence:['lead','substantial','support','unknown'], reproducibility:['unknown','initial','replicated','controlled'],
  characterization:['learning','guided','independent'], recommendation:['promised','specific','comparative','generic','unknown'],
  englishStatus:['expired','moi-ready','valid','unknown'],greStatus:['planned','valid','none'],researchAccess:['unknown','prepared'],
  intendedDegree:['all','masters','direct-phd']
};
const FIELDS = [
  {title:'学业与申请方向', fields:[
    {key:'coreTrend',label:'核心专业课趋势',options:[['rising','持续上升'],['stable','基本稳定'],['falling','近期下降'],['unknown','尚未整理']]},
    {key:'intendedDegree',label:'当前比较的学位',options:[['all','硕士与内地直博都看'],['masters','只看硕士'],['direct-phd','只看内地直博']]},
    {key:'greStatus',label:'GRE 状态',options:[['planned','计划成绩，尚未取得'],['valid','已有有效成绩'],['none','不准备提交']]},
    {key:'greScore',label:'GRE 分数／情景目标',type:'number',min:260,max:340,step:1,note:'默认 330 是情景假设。项目不接受或不要求 GRE 时，不把高分当作补偿。'}
  ]},
  {title:'电池实验研究',fields:[
    {key:'researchStage',label:'当前最成熟的实验课题',options:[['in-progress','正在实验与学习'],['repeatable','已有可重复的关键结果'],['mechanism','主要对照与机制证据较完整'],['manuscript','已形成研究稿件'],['accepted','相关成果已接受／发表']],note:'按已经完成的状态填写，不按预期分区或投稿目标。'},
    {key:'independence',label:'本人承担的研究责任',options:[['lead','主导课题并能解释关键决策'],['substantial','承担实质合作与分析'],['support','主要执行已有研究方案'],['unknown','还未整理贡献']]},
    {key:'reproducibility',label:'关键对照与重复实验',options:[['unknown','尚未确认／待整理'],['initial','已有初步对照或重复'],['replicated','关键结论已重复验证'],['controlled','关键对照与重复较完整']]},
    {key:'characterization',label:'表征与结果解释',options:[['learning','正在学习，需要指导'],['guided','能在指导下完成并解释'],['independent','能独立选择、完成并解释']]},
    {key:'batteryOutputs',label:'已接受／发表的电池实验成果',type:'number',min:0,max:50,step:1,note:'只计本项相关实验成果；预计接收、预计一区和其他领域 ML 论文不计入。'},
    {key:'researchAccess',label:'研究申请准备',options:[['unknown','研究计划与导师匹配尚未完成'],['prepared','已整理计划、课题与导师匹配']],note:'准备完成不代表新学校导师已经接收。'}
  ]},
  {title:'推荐、联系与语言',fields:[
    {key:'recommendation',label:'推荐信证据状态',options:[['promised','导师愿意强推，信件内容尚未落实'],['specific','能具体评价研究工作与贡献'],['comparative','有具体贡献及可信的同辈比较'],['generic','主要是关系或一般评价'],['unknown','尚未确认']]},
    {key:'englishStatus',label:'英语材料状态',options:[['expired','原成绩过期，尚未提供有效成绩'],['moi-ready','已备好 NUS 全英文授课证明'],['valid','已有有效考试成绩，仍逐项核分'],['unknown','尚未确认']],note:'有效成绩仍需满足总分、分项和有效期；MOI 也不能用于所有学校。'},
    {key:'connections.mit',label:'MIT 联系状态',options:[['available','导师可推荐／有联系渠道'],['feedback','拟任导师已给具体积极反馈'],['none','目前没有具体渠道']],note:'联系、反馈与正式接收是不同状态。'},
    {key:'connections.stanford',label:'Stanford 联系状态',options:[['available','导师可推荐／有联系渠道'],['feedback','拟任导师已给具体积极反馈'],['none','目前没有具体渠道']]}
  ]}
];
const DEFAULT_TASKS = [
  {id:'coursework',title:'整理核心专业课薄弱点，制定本学期的提分安排',detail:'以课程与自学为中心。先把要补的概念、题型和复盘频率落到周计划。',category:'学业'},
  {id:'research-evidence',title:'为主导电池课题建立一页研究证据清单',detail:'写清问题、关键选择、本人贡献、已有结果及仍待验证的结论。',category:'研究'},
  {id:'controls',title:'整理关键对照、独立重复与表征的完成状态',detail:'把已完成、需要指导和下一步实验分开；让推荐人和面试官看得懂证据。',category:'研究'},
  {id:'recommendation',title:'向核心推荐人准备一份具体贡献材料包',detail:'包括合作时间、本人决策、解决的问题、成果状态和可引用的例子。',category:'推荐'},
  {id:'profile-docs',title:'更新学术 CV、研究摘要和成果贡献表',detail:'电池实验为主线，ML 作为辅助。竞赛统筹与实践经历保留最能说明能力的证据。',category:'材料'},
  {id:'entry-conditions',title:'给收藏项目核对学历、短学制、语言与研究条件',detail:'需要时备好课程说明、FYP 研究学分占比、MOI 及有效英语成绩。',category:'准入'}
].map(t => ({...t,done:false,custom:false}));
let portfolioSeed = {schemaVersion:1,seedVersion:1,items:[]};
let portfolioFilter = '', portfolioQuery = '', targetProgramId = '', editingPortfolioId = null;
let programs = [], evaluated = [], state, activeTab = 'schools', favoritesOnly = false, pageSize = 18, toastTimer;
let cloudVersion = 0, cloudReady = false, cloudMode = 'loading', cloudSaving = false, cloudDirty = false, cloudBlocked = false, saveTimer, hadLocal = false;

function freshState(){return {schemaVersion:1,portfolio:normalizePortfolio(null,portfolioSeed),profile:clone(DEFAULT),favorites:[],statuses:{},scenarios:[],tasks:clone(DEFAULT_TASKS),credits:{counted:null,remaining:null,target:4.5},updatedAt:new Date().toISOString()};}
function sanitizeProfile(input){
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('背景数据格式不正确。');
  const p=clone(DEFAULT);
  for(const [key,allowed] of Object.entries(validEnum)) if(allowed.includes(input[key]))p[key]=input[key];
  const g=Number(input.gpa);if(!Number.isFinite(g)||g<2||g>5)throw new Error('GPA 应在 2.00—5.00 之间。');p.gpa=Math.round(g*100)/100;
  for(const [key,min,max] of [['greScore',260,340],['batteryOutputs',0,50]])if(Number.isFinite(Number(input[key]))&&Number(input[key])>=min&&Number(input[key])<=max)p[key]=Math.round(Number(input[key]));
  p.connections={mit:'none',stanford:'none'};
  for(const k of ['mit','stanford'])if(['none','available','feedback'].includes(input.connections?.[k]))p.connections[k]=input.connections[k];
  p.prerequisitesConfirmed=input.prerequisitesConfirmed===true;
  p.programEvidence={};
  if(input.programEvidence&&typeof input.programEvidence==='object')for(const [id,item] of Object.entries(input.programEvidence).slice(0,200)){
    if(!/^([A-Z]{1,5}\d{3})$/.test(id)||!item||typeof item!=='object')continue;
    const evidence={};for(const k of ['supervisor','prerequisites','conditions'])if(item[k]==='confirmed')evidence[k]='confirmed';
    if(Object.keys(evidence).length)p.programEvidence[id]=evidence;
  }
  return p;
}
function sanitizeState(input){
  if(!input || input.schemaVersion!==1)throw new Error('这不是本规划工具的 v1 背景备份。');
  const next=freshState();next.profile=sanitizeProfile(input.profile);next.portfolio=normalizePortfolio(input.portfolio,portfolioSeed);
  next.updatedAt=Number.isFinite(Date.parse(input.updatedAt))?input.updatedAt:new Date().toISOString();
  next.favorites=Array.isArray(input.favorites)?[...new Set(input.favorites.filter(x=>typeof x==='string'&&/^[A-Z]{1,5}\d{3}$/.test(x)))].slice(0,300):[];
  next.statuses={};if(input.statuses&&typeof input.statuses==='object')for(const [id,v]of Object.entries(input.statuses))if(/^[A-Z]{1,5}\d{3}$/.test(id)&&STATUSES.includes(v))next.statuses[id]=v;
  next.scenarios=Array.isArray(input.scenarios)?input.scenarios.slice(0,20).flatMap(s=>{
    try{if(typeof s.id!=='string'||typeof s.name!=='string')return[];return[{id:s.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80),name:s.name.slice(0,60),profile:sanitizeProfile(s.profile),createdAt:Number.isFinite(Date.parse(s.createdAt))?s.createdAt:next.updatedAt}];}catch{return[];}
  }):[];
  next.tasks=Array.isArray(input.tasks)?input.tasks.slice(0,100).filter(t=>t&&typeof t.title==='string'&&typeof t.id==='string').map(t=>({id:t.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80),title:t.title.slice(0,180),detail:String(t.detail||'').slice(0,600),category:String(t.category||'自定义').slice(0,15),done:t.done===true,custom:t.custom===true})):clone(DEFAULT_TASKS);
  if(input.credits&&typeof input.credits==='object')for(const key of ['counted','remaining','target']){
    const v=input.credits[key];if(v===null||v==='')next.credits[key]=key==='target'?4.5:null;
    else if(Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=(key==='target'?5:500))next.credits[key]=Number(v);
  }
  return next;
}
function needsPortfolioMigration(input){return JSON.stringify(input?.portfolio??null)!==JSON.stringify(normalizePortfolio(input?.portfolio,portfolioSeed));}
function finishCloudLoad(raw){if(needsPortfolioMigration(raw)){cloudDirty=true;persist();}else{$('save-state').textContent='已与云端同步';}}
function loadLocal(){try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){hadLocal=true;return sanitizeState(JSON.parse(raw));}}catch{toast('原有本机数据无法读取，已打开初始背景。');}return freshState();}
function saveLocal(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true;}catch{$('save-state').textContent='本机保存失败，请导出备份';return false;}}
function persist(){state.updatedAt=new Date().toISOString();saveLocal();cloudDirty=true;if(cloudReady&&!cloudBlocked){$('save-state').textContent='本机已保存，等待云端同步';clearTimeout(saveTimer);saveTimer=setTimeout(syncCloud,800);}else if(cloudMode!=='loading')$('save-state').textContent=cloudBlocked?'本机已保存 · 云端待处理':'仅在本机保存';}
function notice(html){$('sync-notice').innerHTML=html;$('sync-notice').hidden=!html;}
async function initCloud(){
  try{
    const response=await fetch('./api/state',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    if(response.status===401||response.status===403){cloudMode='local';$('save-state').textContent='仅在本机保存';return;}
    if(!response.ok)throw new Error('cloud-load');
    const payload=await response.json();cloudVersion=Number(payload.version)||0;cloudReady=true;cloudMode='ready';
    if(payload.state){const remote=sanitizeState(payload.state);
      if((hadLocal||cloudDirty)&&Date.parse(state.updatedAt)>Date.parse(remote.updatedAt)+1000){
        cloudBlocked=true;notice('<strong>本机有较新的改动。</strong><p>为避免覆盖，请选择继续使用本机背景并同步，或载入云端版本。你也可以先导出本机备份。</p><div><button id="sync-use-local" class="button button-primary">使用本机并同步</button><button id="sync-use-cloud" class="button button-outline">载入云端</button><button id="sync-export" class="text-button">先导出本机备份</button></div>');
        $('sync-use-local').onclick=()=>{cloudBlocked=false;notice('');cloudDirty=true;syncCloud();};
        $('sync-use-cloud').onclick=()=>{if(confirm('载入云端背景将替换本机的未同步改动。是否继续？')){state=remote;cloudDirty=false;clearTimeout(saveTimer);saveLocal();cloudBlocked=false;notice('');refreshAll();finishCloudLoad(payload.state);}};
        $('sync-export').onclick=exportBackup;$('save-state').textContent='本机较新 · 待选择';return;
      }
      state=remote;cloudDirty=false;clearTimeout(saveTimer);saveLocal();refreshAll();finishCloudLoad(payload.state);
    }else{cloudDirty=true;await syncCloud();}
  }catch{cloudMode='local';cloudReady=false;$('save-state').textContent='仅在本机保存';}
}
async function syncCloud(){
  if(!cloudReady||cloudBlocked||cloudSaving||!cloudDirty)return;
  cloudSaving=true;cloudDirty=false;const snapshot=clone(state);$('save-state').textContent='正在同步云端…';
  try{
    const response=await fetch('./api/state',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:snapshot,version:cloudVersion})});
    if(response.status===409){cloudBlocked=true;cloudDirty=true;notice('<strong>云端已有另一处更新，本机改动已保留。</strong><p>没有覆盖任何版本。请先导出本机备份，或重新载入云端后继续。</p><div><button id="conflict-export" class="button button-primary">导出本机备份</button><button id="conflict-reload" class="button button-outline">载入云端最新版本</button></div>');$('conflict-export').onclick=exportBackup;$('conflict-reload').onclick=reloadCloud;$('save-state').textContent='本机已保存 · 云端版本冲突';return;}
    if(!response.ok)throw new Error('cloud-save');
    const result=await response.json();cloudVersion=Number(result.version)||cloudVersion;cloudMode='ready';cloudDirty=cloudDirty||state.updatedAt!==snapshot.updatedAt;$('save-state').textContent=cloudDirty?'本机已保存，等待同步':'已与云端同步';
  }catch{cloudDirty=true;cloudMode='local';$('save-state').textContent='本机已保存 · 云端暂未同步';}
  finally{cloudSaving=false;if(cloudDirty&&!cloudBlocked&&cloudMode==='ready'){clearTimeout(saveTimer);saveTimer=setTimeout(syncCloud,800);}}
}
async function reloadCloud(){
  if(!confirm('是否用云端最新版本替换本机改动？建议先导出本机备份。'))return;
  try{const r=await fetch('./api/state',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error();const payload=await r.json();state=payload.state?sanitizeState(payload.state):freshState();cloudVersion=Number(payload.version)||0;cloudBlocked=false;cloudReady=true;cloudMode='ready';cloudDirty=false;saveLocal();notice('');refreshAll();finishCloudLoad(payload.state);toast('已载入云端最新版本');}catch{toast('暂时无法载入云端，本机改动仍保留。');}
}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function profileValue(key,p=state.profile){return key.startsWith('connections.')?p.connections?.[key.split('.')[1]]:p[key];}
function updateProfile(key,value){if(key.startsWith('connections.'))state.profile.connections[key.split('.')[1]]=value;else state.profile[key]=value;persist();refreshEvaluations();renderRibbon();renderStats();renderPrograms();renderPlanning();renderComparison();renderCredits();renderTargetGap();}
function researchLabel(p){return ({'in-progress':'研究进行中','repeatable':'关键结果可重复','mechanism':'主要机制证据较完整','manuscript':'已形成研究稿件','accepted':'相关实验成果已接受／发表'})[p.researchStage]||'研究状态待整理';}
function backgroundSummary(p){const rec=({'promised':'强推承诺待落实','specific':'具体研究推荐','comparative':'具体且有同辈比较的推荐','generic':'一般推荐','unknown':'推荐待确认'})[p.recommendation];return `${researchLabel(p)} · ${p.characterization==='independent'?'可独立表征解释':'表征能力继续完善'} · ${rec}`;}
function tierClass(tier){return /成绩未达/.test(tier)?'tier-unmet':/条件/.test(tier)?'tier-condition':/冲刺/.test(tier)?'tier-reach':/主申/.test(tier)?'tier-main':'tier-safer';}
function tierBadge(tier,extra=''){return `<span class="tier-badge ${extra||tierClass(tier)}">${esc(tier||'待判断')}</span>`;}
function tierRank(tier){const i=TIERS.indexOf(tier);return i<0?TIERS.length:i;}
function substantiveReasons(p,profile=state.profile,previous=null,previousProfile=null){
  const selected=[],all=(p.reasons||[]).filter(r=>!/^保守参考已有|^参考已有/.test(r));
  const gate=p.gpaGate||{};
  if(gate.status==='below')selected.push(`当前 GPA ${Number(profile.gpa).toFixed(2)} 低于本项目已核的 ${Number(gate.minimum).toFixed(gate.minimum===4.375?3:2)}/5 成绩标准；软背景不抵消这项准入限制。`);
  else if(previous?.gpaGate?.status==='below'&&gate.status==='met')selected.push(`从 ${Number(previousProfile?.gpa??0).toFixed(2)} 调整至 ${Number(profile.gpa).toFixed(2)} 后，已达到本项目 ${Number(gate.minimum).toFixed(gate.minimum===4.375?3:2)}/5 成绩标准；其他条件仍需满足。`);
  else if(gate.status==='guide-below')selected.push('当前低于 UNSW 官方计算器的指导值，需由学校正式核算成绩及一年减免资格。');
  const soft=all.find(r=>/独立贡献、关键对照|近期核心课程下降|当前贡献或推荐具体性尚弱/.test(r));
  if(soft)selected.push(soft);
  if(p.tier==='条件候选'&&p.condition)selected.push(p.condition);
  if(previous&&p.languageStatus?.status!==previous.languageStatus?.status)selected.push(`英语材料提示由“${previous.languageStatus?.label||'待核'}”变为“${p.languageStatus?.label||'待核'}”；仍需按本项目核分项、有效期和可接受证明。`);
  const original=Number(profile.gpa)>=4.5?(p.reason45||p.assessment45):(p.reason41||p.assessment41);
  if(original)selected.push(original);
  selected.push(...all.filter(r=>!/^当前达到已核|^原名单有项目特定条件/.test(r)));
  return [...new Set(selected.filter(Boolean))].slice(0,2);
}
function refreshEvaluations(){evaluated=programs.map(p=>engine.evaluateProgram(p,state.profile));}
function switchTab(tab){if(!['schools','profile','portfolio','compare'].includes(tab))tab='schools';activeTab=tab;const labels={schools:['项目名单','让每一次背景更新，都有清楚的判断依据。'],profile:['背景与规划','先把下一步要做的事，排出轻重。'],portfolio:['我的经历','把你已经做过的事，整理成可更新、可举证的申请档案。'],compare:['情景对比','看看 GPA 与研究证据变化后，申请布局会怎样调整。']};
  for(const key of ['schools','profile','portfolio','compare'])$(`tab-${key}`).hidden=key!==tab;
  document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-selected',String(b.dataset.tab===tab));});
  $('page-label').textContent=labels[tab][0];$('page-title').textContent=labels[tab][0];$('page-description').textContent=labels[tab][1];
  history.replaceState(null,'',`#${tab}`);if(tab==='compare')renderComparison();if(tab==='portfolio')renderPortfolio();window.scrollTo({top:0,behavior:'auto'});
}
function renderRibbon(){const p=state.profile;$('gpa-number').value=Number(p.gpa).toFixed(2);$('gpa-slider').value=p.gpa;$('gpa-descriptor').textContent=p.gpa>=4.5?'达到4.5目标':p.gpa>=4?'当前成绩区间':'探索情景';$('background-summary').textContent=backgroundSummary(p);$('scenario-label').textContent='当前背景';}
function renderStats(){const summary=engine.summarize(evaluated);const available=evaluated.filter(p=>!['条件候选','成绩未达线'].includes(p.tier)).length;const conditional=evaluated.filter(p=>p.tier==='条件候选').length;const hard=summary.hardGpaBelow??evaluated.filter(p=>p.gpaGate?.status==='below').length;const items=[['全部项目',programs.length,'硕士与内地直博分开保留','#b6cbb4'],['可继续比较',available,'仍需满足各项目具体条件','#69a292'],['需先核条件',conditional,'学历、先修、导师或研究入口','#c5a26b'],['官方成绩待达线',hard,'只用已核官方数字作准入判断','#bd8c7b']];$('stats').innerHTML=items.map(([label,value,note,color])=>`<article class="stat-card" style="--stat-color:${color}"><div class="label">${label}</div><div class="value">${value}<small>个项目</small></div><p>${note}</p></article>`).join('');$('nav-count').textContent=programs.length;}
function getFiltered(){let items=evaluated;const q=$('search').value.trim().toLowerCase(),region=$('filter-region').value,degree=$('filter-degree').value,tier=$('filter-tier').value,userTier=$('filter-user-tier').value,fit=$('filter-fit').value,status=$('filter-status').value,short=$('filter-short').checked;
  const intended=state.profile.intendedDegree;
  return items.filter(p=>{
    if(favoritesOnly&&!state.favorites.includes(p.id))return false;
    if(q&&!`${p.id} ${p.school} ${p.program} ${p.region} ${p.fit||''}`.toLowerCase().includes(q))return false;
    if(region&&p.region!==region||degree&&p.degree_type!==degree||tier&&p.tier!==tier||userTier&&p.user_tier!==userTier)return false;
    if(fit&&p.fit_priority!==fit)return false;
    if(status&&(state.statuses[p.id]||'未开始')!==status)return false;
    if(intended==='masters'&&p.degree_type!=='硕士'||intended==='direct-phd'&&p.degree_type!=='内地直博')return false;
    if(short&&!isShort(p))return false;
    return true;
  }).sort((a,b)=>tierRank(a.tier)-tierRank(b.tier)||((a.school||'').localeCompare(b.school||'','zh'))||a.id.localeCompare(b.id));
}
function durationInfo(p){
  const source=String(p.duration||'').toLowerCase(),s=source.replace(/\s+/g,' ').trim();
  if(p.degree_type==='内地直博')return{short:false,conditional:false,label:'博士学制'};
  if(p.id==='M129')return{short:true,conditional:true,label:'预计1.5年，标准两年'};
  const explicitRoute=/减免|加速|抵免|rpl|rvl|credit|advanced standing|shorten|缩至|缩短|获批|expected|预计|审批|等值|equivalence|depending|subject to|route|路线|pathway/.test(s);
  const negative=/没有(?:明确)?(?:的)?(?:一年|1年|1\.5年|短)|未(?:核实|核得|确认|证实).{0,15}(?:一年|1年|1\.5年|短)|(?:一年|1年|1\.5年).{0,8}(?:不成立|不适用|不可行)|not (?:a |an )?(?:one|1)[ -]?year|no (?:confirmed |verified )?short/.test(s);
  if(negative)return{short:false,conditional:true,label:'短学制尚未确认'};
  const total=s.match(/(?:共|总计|合计|总学制|overall|total)\s*(\d+(?:\.\d+)?)\s*(?:年|years?)/);
  if(total&&Number(total[1])>1.5&&!explicitRoute)return{short:false,conditional:false,label:'学制超过1.5年'};
  const ranges=[...s.matchAll(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:[-—–~至到]|to)\s*(\d+(?:\.\d+)?)\s*(年|years?|个月|months?)/g)];
  let found=false,rangeConditional=false;
  for(const r of ranges){const isMonth=/月|month/.test(r[3]),min=Number(r[1])/(isMonth?12:1),max=Number(r[2])/(isMonth?12:1);if(min>0&&min<=1.5){found=true;if(max>1.5)rangeConditional=true;}}
  const years=[...s.matchAll(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:个)?\s*(?:日历|学|calendar\s*)?\s*(年|years?)/g)].map(m=>Number(m[1]));
  const months=[...s.matchAll(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:个月|months?)/g)].map(m=>Number(m[1]));
  found=found||years.some(n=>n>0&&n<=1.5)||months.some(n=>n>0&&n<=18)||/一年半|一年|九个月|十个月|十一个月|十二个月|十八个月|\bone\s+(?:full[ -]?time\s+|academic\s+|calendar\s+)?year\b/.test(s);
  if(!found)return{short:false,conditional:/未定|varies|另核|待核/.test(s),label:'学制需放宽／另核'};
  const longer=years.some(n=>n>1.5)||/两年|二年|三年|two\s+years|three\s+years/.test(s);
  const conditional=rangeConditional||explicitRoute||longer||/可(?:以)?|可能|不保证|typically|normally|maximum|approval|approved/.test(s);
  return{short:true,conditional,label:conditional?'有≤1.5年路线 · 须核条件':'≤1.5年路线'};
}
function isShort(p){return durationInfo(p).short;}
const VERIFICATION_LABELS = {'document':'材料支持','user-confirmed':'本人确认','to-confirm':'待确认'};
const RELEVANCE_LABELS = {'battery-experimental':'电池实验','battery-ml':'电池建模 / ML','materials':'材料 / 化工','other':'其他方向'};
const PORTFOLIO_FIELDS = ['title','organization','role','status','date','contribution','evidence','source','verification','relevance','notes'];
function portfolioCategoryLabel(category){return PORTFOLIO_CATEGORIES[category]||'其他';}
function portfolioStatusLabel(status){return ({complete:'已具备',missing:'待补齐','to-confirm':'待确认',developing:'继续完善','not-applicable':'不适用'})[status]||'待整理';}
function renderGapAnalysis(p){
  const analysis=buildProgramGapAnalysis(p,state.profile,state.portfolio?.items||[]);
  const uplift=analysis.uplift||{};
  const sources=(value,label='核对来源')=>{if(!value)return '';const text=typeof value==='string'?value:(value.label||value.title||value.url||'原项目资料');const url=safeUrl(typeof value==='string'?value:value.url);return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:esc(text);};
  return `<section class="gap-analysis" aria-label="${esc(p.school)} 的申请差距"><div class="gap-heading"><div><p class="eyebrow">YOUR NEXT STEP</p><h3>还差什么，补到什么程度？</h3></div>${tierBadge(p.tier)}</div><p class="gap-note">以下按当前背景和经历档案生成。官方条件与建议准备目标分别列出；“待确认”表示证据尚未核实。</p><div class="gap-list">${(analysis.gaps||[]).map(g=>`<article class="gap-item gap-${esc(g.status||'to-confirm')}"><div class="gap-title"><div><h4>${esc(g.title)}</h4><small class="gap-basis">${g.basis==='official'?'官方条件 / 已核参考':'建议准备目标'}</small></div><span class="evidence-badge status-${esc(g.status||'to-confirm')}">${esc(portfolioStatusLabel(g.status))}</span></div><dl><div><dt>当前情况</dt><dd>${esc(g.current)}</dd></div><div><dt>建议补到</dt><dd>${esc(g.target)}</dd></div><div><dt>对申请的作用</dt><dd>${esc(g.impact)}</dd></div></dl>${g.source?`<div class="gap-source">依据：${sources(g.source,g.sourceLabel||'项目来源')}</div>`:''}</article>`).join('')}</div><aside class="uplift-card"><h4>补齐后，档位可能怎样变化？</h4><div class="uplift-tiers">${tierBadge(uplift.currentTier||p.tier)}<span aria-hidden="true">→</span>${tierBadge(uplift.potentialTier||p.tier)}</div><p>${esc(uplift.summary||'完善背景后重新评估；是否提档还取决于项目条件和研究证据。')}</p>${uplift.conditions?.length?`<ul>${uplift.conditions.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:''}<p class="gap-note">这是规划中的条件情景，不是录取承诺。经历中的论文状态、推荐关系不会自动替代上方“背景与规划”的能力确认。</p></aside><div class="source-date">项目政策资料核对：${esc(p.checked||'待核对')}。更新经历不会自动更新学校政策。</div></section>`;
}
function renderPortfolioSummary(){
  const summary=summarizePortfolio(state.portfolio);
  const description=Object.entries(PORTFOLIO_CATEGORIES).map(([key,label])=>`${label} ${summary.counts?.[key]||0}`).join(' · ');
  $('profile-portfolio-summary').textContent=`已整理 ${summary.total} 条经历：${description}。${summary.toConfirm?`其中 ${summary.toConfirm} 条仍需确认。`:''}`;
}
function renderPortfolio(){
  if(!state?.portfolio)return;
  const summary=summarizePortfolio(state.portfolio), counts=summary.counts||{};
  $('portfolio-summary').innerHTML=Object.entries(PORTFOLIO_CATEGORIES).map(([key,label])=>`<article class="portfolio-stat"><span>${esc(label)}</span><strong>${counts[key]||0}</strong></article>`).join('');
  $('portfolio-confirmations').textContent=`待确认 ${summary.toConfirm||0} 条`;
  const q=portfolioQuery.trim().toLowerCase();
  const items=state.portfolio.items.filter(item=>(!portfolioFilter||(portfolioFilter==='to-confirm'?item.verification==='to-confirm':item.category===portfolioFilter))&&(!q||PORTFOLIO_FIELDS.map(k=>item[k]||'').join(' ').toLowerCase().includes(q)));
  $('portfolio-count').textContent=`${items.length} / ${summary.total}`;
  $('portfolio-list').innerHTML=items.length?items.map(item=>`<article class="portfolio-card"><div class="portfolio-card-top"><div class="portfolio-badges"><span class="category-badge">${esc(portfolioCategoryLabel(item.category))}</span><span class="evidence-badge ${item.verification==='to-confirm'?'status-to-confirm':'status-complete'}">${esc(VERIFICATION_LABELS[item.verification]||'待确认')}</span>${item.relevance&&item.relevance!=='other'?`<span class="category-badge">${esc(RELEVANCE_LABELS[item.relevance]||item.relevance)}</span>`:''}</div><div class="portfolio-actions"><button class="text-button" data-edit-portfolio="${esc(item.id)}" aria-label="编辑 ${esc(item.title)}">编辑</button><button class="text-button danger" data-delete-portfolio="${esc(item.id)}" aria-label="删除 ${esc(item.title)}">删除</button></div></div><h3>${esc(item.title)}</h3><p class="portfolio-meta">${[item.organization,item.role,item.date].filter(Boolean).map(esc).join(' · ')}</p>${item.status?`<p class="portfolio-status"><strong>当前状态</strong> ${esc(item.status)}</p>`:''}<dl class="portfolio-evidence">${[['本人贡献',item.contribution],['可用证据',item.evidence],['资料来源',item.source],['补充说明',item.notes]].filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value).replace(/\n/g,'<br>')}</dd></div>`).join('')}</dl></article>`).join(''):`<div class="empty-state"><h3>${q||portfolioFilter?'没有匹配的经历':'还没有经历记录'}</h3><p>可以调整筛选，或点“新增经历”加入一条记录。</p></div>`;
  renderPortfolioSummary();renderTargetSelectors();renderTargetGap();
}
function renderTargetSelectors(){
  const selected=targetProgramId||$('target-program').value;
  const fav=programs.filter(p=>state.favorites.includes(p.id)),rest=programs.filter(p=>!state.favorites.includes(p.id));
  const options=list=>list.map(p=>`<option value="${esc(p.id)}">${esc(p.school)} · ${esc(p.program)} (${esc(p.id)})</option>`).join('');
  $('target-program').innerHTML=`${fav.length?`<optgroup label="我的收藏">${options(fav)}</optgroup>`:''}<optgroup label="全部其他项目">${options(rest)}</optgroup>`;
  targetProgramId=programs.some(p=>p.id===selected)?selected:(fav[0]?.id||programs[0]?.id||'');
  $('target-program').value=targetProgramId;
}
function renderTargetGap(){
  if(!$('target-gap'))return;
  const p=evaluated.find(item=>item.id===targetProgramId)||evaluated[0];
  $('target-gap').innerHTML=p?`<div class="target-program-label"><h3>${esc(p.school)}</h3><p>${esc(p.program)} · ${esc(p.id)}</p></div>${renderGapAnalysis(p)}`:'';
}
function openPortfolioEditor(id){
  const existing=id?state.portfolio.items.find(item=>item.id===id):null;
  const item=existing||createPortfolioItem(PORTFOLIO_CATEGORIES[portfolioFilter]?portfolioFilter:'paper');
  editingPortfolioId=item.id;
  const form=$('portfolio-form');
  form.reset();form.elements.namedItem('category').value=item.category;
  for(const key of PORTFOLIO_FIELDS)form.elements.namedItem(key).value=item[key]||((key==='verification')?'user-confirmed':(key==='relevance'?'other':''));
  $('portfolio-editor-title').textContent=existing?'修改经历':'新增经历';
  $('portfolio-editor-error').hidden=true;$('portfolio-editor-error').textContent='';
  $('portfolio-editor').showModal();form.elements.namedItem('title').focus();
}
function savePortfolioEditor(event){
  event.preventDefault();const form=$('portfolio-form');if(!form.reportValidity())return;
  const existing=state.portfolio.items.find(item=>item.id===editingPortfolioId);
  const item={...(existing||{}),id:editingPortfolioId,category:form.elements.namedItem('category').value};
  for(const key of PORTFOLIO_FIELDS)item[key]=form.elements.namedItem(key).value.trim();
  try{state.portfolio=upsertPortfolioItem(state.portfolio,item);persist();$('portfolio-editor').close();renderPortfolio();renderPrograms();renderPlanning();toast(existing?'经历已更新，项目缺口说明已重算。':'经历已添加，项目缺口说明已重算。');}
  catch(error){$('portfolio-editor-error').textContent=error.message||'无法保存，请检查填写内容。';$('portfolio-editor-error').hidden=false;}
}
function deletePortfolioItem(id){
  const item=state.portfolio.items.find(x=>x.id===id);if(!item)return;
  if(!confirm(`删除“${item.title}”？删除会同步到私人云端，刷新后也不会重新填入。`))return;
  state.portfolio=removePortfolioItem(state.portfolio,id);persist();renderPortfolio();renderPrograms();renderPlanning();toast('经历已删除。');
}

function programDetails(p){const blocks=[['本情景的判断依据',p.reasons?.join('\n')],['学制与短路线条件',p.duration],['官网原始成绩要求',p.academic_original],['官方 NUS／新加坡标准',p.nus_official],['辅助参照与准备目标',p.nus_reference],['专业先修与学历',p.prerequisites],['GRE',p.gre],['英语要求与 NUS 材料',`${p.english||''}\n${p.nus_waiver||''}`],['研究形式',p.researchFit],['研究安排',p.research],['推荐与申请材料',p.refs_documents],['导师与研究入口',p.supervisor],['下一步',p.nextSteps?.join('；')||p.next_steps],['需进一步确认',p.condition||p.caveats]];
  const sources=(p.sources||[]).map(safeUrl).filter(Boolean);
  return `<div class="program-details" id="detail-${esc(p.id)}" hidden>${renderGapAnalysis(p)}${blocks.filter(([,v])=>v).map(([label,value])=>`<h4>${label}</h4><p>${esc(value).replace(/\n/g,'<br>')}</p>`).join('')}<h4>官方来源</h4><div class="source-links">${sources.map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${i===0?'项目官网／招生入口':`官网来源 ${i+1}`} ↗</a>`).join('')}</div><div class="source-date">资料核对：${esc(p.checked||'待核对')} · 学校政策不会随情景自动刷新</div></div>`;
}
function renderPrograms(){const filtered=getFiltered(),show=filtered.slice(0,pageSize);$('result-count').textContent=`${filtered.length} / ${programs.length}`;$('favorites-count').textContent=state.favorites.length;
  $('show-all').classList.toggle('active',!favoritesOnly);$('show-favorites').classList.toggle('active',favoritesOnly);
  $('program-list').innerHTML=show.map(p=>{
    const fav=state.favorites.includes(p.id),status=state.statuses[p.id]||'未开始';const flags=(p.flags||[]).filter(f=>/below|condition|prerequisite|supervisor|language|uncertain/.test(f.kind||''));
    const flag=flags[0];const reason=substantiveReasons(p).map(esc).join('<br>');const degree=p.degree_type==='内地直博'?'内地直博':'硕士';
    return `<article class="program-card" data-program="${esc(p.id)}"><div class="card-topline"><div class="program-meta"><b>${esc(p.id)}</b> · ${esc(p.region)} · ${degree}<br>资料核对 ${esc(p.checked||'待核对')}</div><button class="favorite-button ${fav?'active':''}" data-favorite="${esc(p.id)}" aria-pressed="${fav}" aria-label="${fav?'取消收藏':'收藏'} ${esc(p.school)} ${esc(p.program)}">${fav?'★':'☆'}</button></div><h3>${esc(p.school)}</h3><div class="program-title">${esc(p.program)}</div><div class="tier-pair"><div><span class="caption">随背景更新的建议</span>${tierBadge(p.tier)}</div><div><span class="caption">你的申请分档</span>${tierBadge(p.user_tier,'tier-user')}</div></div><div class="card-facts"><span>${esc(durationInfo(p).label)}</span><span class="fact-dot"></span><span>方向匹配 ${esc(p.fit_priority||'待判断')}</span></div><p class="card-reason"><strong>为什么这样判断</strong><br>${reason}</p>${flag?`<div class="condition-note">${esc(flag.label||'条件待确认')}：${esc(flag.detail||'请查看项目详情。')}</div>`:''}<div class="card-bottom"><label><span class="sr-only">${esc(p.school)} 的申请进度</span><select data-status="${esc(p.id)}">${STATUSES.map(s=>`<option ${status===s?'selected':''}>${s}</option>`).join('')}</select></label><button class="text-button" data-details="${esc(p.id)}" aria-expanded="false" aria-controls="detail-${esc(p.id)}">缺口与申请要求 ＋</button></div>${programDetails(p)}</article>`;
  }).join('');
  $('empty-state').hidden=filtered.length>0;$('load-more').hidden=show.length>=filtered.length;$('shown-count').textContent=filtered.length?`已显示 ${show.length} / ${filtered.length} 个项目`:'';
}
function renderBackgroundForm(){const p=state.profile;$('background-form').innerHTML=FIELDS.map((group,i)=>`<section class="form-group"><div class="form-group-header"><span>0${i+1}</span><h3>${group.title}</h3></div><div class="form-fields">${group.fields.map(f=>`<label class="field ${f.full?'full-width':''}"><span>${f.label}</span>${f.options?`<select name="${f.key}">${f.options.map(([value,label])=>`<option value="${value}" ${profileValue(f.key,p)===value?'selected':''}>${label}</option>`).join('')}</select>`:`<input name="${f.key}" type="${f.type}" min="${f.min}" max="${f.max}" step="${f.step}" value="${esc(profileValue(f.key,p))}">`}${f.note?`<small>${f.note}</small>`:''}</label>`).join('')}</div></section>`).join('');}
function renderPlanning(){renderPortfolioSummary();const suggestions=engine.getPlanningSuggestions(state.profile,evaluated);const list=Array.isArray(suggestions)?suggestions:(suggestions?.priorities||[]);$('planning-insights').innerHTML=list.slice(0,5).map((s,i)=>`<article class="insight-item"><div class="insight-index">0${i+1} · ${esc(s.category||'下一步')}</div><h3>${esc(s.title)}</h3><p>${esc(s.action||s.why||s.description||'')}</p>${s.why&&s.action?`<p>${esc(s.why)}</p>`:''}</article>`).join('');}
function renderTasks(){const complete=state.tasks.filter(t=>t.done).length;$('task-progress').textContent=`${complete} / ${state.tasks.length} 已完成`;$('task-list').innerHTML=state.tasks.map(t=>`<div class="task-item ${t.done?'done':''}"><input id="task-${esc(t.id)}" type="checkbox" data-task="${esc(t.id)}" ${t.done?'checked':''}><label class="task-copy" for="task-${esc(t.id)}"><strong>${esc(t.title)}</strong>${t.detail?`<p>${esc(t.detail)}</p>`:''}</label><span class="task-tag">${esc(t.category)}</span>${t.custom?`<button class="task-delete" data-delete-task="${esc(t.id)}" aria-label="删除行动 ${esc(t.title)}">×</button>`:''}</div>`).join('');}
function renderCredits(){const c=state.credits;for(const key of ['counted','remaining','target']){const input=$('credits-form').elements.namedItem(key);if(document.activeElement!==input)input.value=c[key]??'';}
  const output=$('credits-result');output.classList.remove('warning');
  if(c.counted===null||c.remaining===null){output.textContent='填入两项学分后，计算所需后续平均 GPA。';return;}
  if(!Number.isFinite(c.counted)||c.counted<0||!Number.isFinite(c.remaining)||c.remaining<=0||!Number.isFinite(c.target)||c.target<2||c.target>5){output.textContent='请填写有效学分，后续计分学分须大于 0，目标 GPA 在 2—5 之间。';return;}
  const required=(c.target*(c.counted+c.remaining)-state.profile.gpa*c.counted)/c.remaining;
  if(required>5.00001){output.classList.add('warning');output.innerHTML=`按这组学分输入，后续需平均 <strong>${required.toFixed(2)} / 5.00</strong>，单靠这些后续课程无法达到目标。可以检查预计计分学分与目标；这不代表其他学分安排下也无法达到。`;}
  else if(required<=0){output.innerHTML='按这组学分输入，当前累计成绩已经为目标留下较大余量。仍须满足学校各项毕业要求。';}
  else output.innerHTML=`后续计分课程需要平均约 <strong>${required.toFixed(2)} / 5.00</strong>，使累计 GPA 达到 ${c.target.toFixed(2)}。<small>按当前 GPA ${state.profile.gpa.toFixed(2)}、已计分 ${c.counted} 学分、后续计分 ${c.remaining} 学分计算；仅作加权平均规划。</small>`;
}
function scenarioOptions(){return[{id:'current',name:'当前正在编辑的背景',profile:state.profile},{id:'gpa41',name:'当前软背景 + GPA 4.1',profile:{...clone(state.profile),gpa:4.1}},{id:'gpa45',name:'当前软背景 + GPA 4.5',profile:{...clone(state.profile),gpa:4.5}},...state.scenarios.map(s=>({...s,id:`saved:${s.id}`}))];}
function renderScenarioSelectors(){const currentA=$('compare-a').value||'gpa41',currentB=$('compare-b').value||'gpa45';const list=scenarioOptions();for(const [id,value]of[['compare-a',currentA],['compare-b',currentB]]){$(id).innerHTML=list.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');$(id).value=list.some(s=>s.id===value)?value:'current';}}
function renderComparison(){const options=scenarioOptions();const a=options.find(s=>s.id===$('compare-a').value)||options[1],b=options.find(s=>s.id===$('compare-b').value)||options[2];if(!a||!b)return;
  const ea=programs.map(p=>engine.evaluateProgram(p,a.profile)),eb=programs.map(p=>engine.evaluateProgram(p,b.profile));const changed=ea.map((p,i)=>({a:p,b:eb[i]})).filter(x=>x.a.tier!==x.b.tier||x.a.gpaGate?.status!==x.b.gpaGate?.status||x.a.languageStatus?.status!==x.b.languageStatus?.status);
  $('comparison-summary').innerHTML=`<div class="compare-overview">${[a,b].map(s=>`<article class="compare-box"><h3>${esc(s.name)}</h3><div class="compare-gpa">${s.profile.gpa.toFixed(2)}<span>/ 5.00 GPA</span></div><p>${esc(backgroundSummary(s.profile))}</p></article>`).join('')}</div><div class="comparison-result"><strong>${changed.length}</strong><span>个项目的建议档位或独立条件提示发生变化</span></div>`;
  $('comparison-differences').innerHTML=changed.length?`<div class="comparison-list">${changed.slice(0,30).map(({a:p,b:q})=>`<article class="comparison-row"><div><h3>${esc(q.school)}</h3><p>${esc(q.program)}</p><p>${substantiveReasons(q,b.profile,p,a.profile).map(esc).join('<br>')}</p></div><div class="comparison-tiers">${tierBadge(p.tier)}<span>→</span>${tierBadge(q.tier)}</div></article>`).join('')}</div><p class="comparison-note">${changed.length>30?`已显示前 30 个变化项目，共 ${changed.length} 个。`:''}档位未变化不代表背景没有价值；顶尖项目、研究名额和先修条件不会被一个分数自动解除。这里比较的是规划判断，不是录取概率。</p>`:`<div class="empty-state"><h3>这两个情景没有改变当前档位或条件提示</h3><p>仍可比较研究准备是否更充分。少量背景变化不需要强行改变所有学校的档位。</p></div>`;
  renderScenarios();
}
function renderScenarios(){$('scenario-list').innerHTML=state.scenarios.length?state.scenarios.map(s=>`<article class="scenario-card"><div><h3>${esc(s.name)}</h3><p>GPA ${s.profile.gpa.toFixed(2)} · ${esc(researchLabel(s.profile))}</p><p>保存于 ${esc(new Date(s.createdAt).toLocaleDateString('zh-CN'))}</p></div><div class="scenario-actions"><button class="button button-outline" data-load-scenario="${esc(s.id)}">载入背景</button><button class="text-button danger" data-delete-scenario="${esc(s.id)}">删除</button></div></article>`).join(''):'<p class="scenario-empty">还没有保存的情景。先更新背景，再点“保存当前情景”。</p>';}
function saveScenario(){if(state.scenarios.length>=20){toast('最多保留 20 个情景，请先删除不再使用的情景。');return;}const name=prompt('给这个背景情景起个名字',`GPA ${state.profile.gpa.toFixed(2)} · ${researchLabel(state.profile)}`);if(name===null)return;if(!name.trim()){toast('请输入情景名称。');return;}state.scenarios.push({id:`s${Date.now().toString(36)}`,name:name.trim().slice(0,60),profile:clone(state.profile),createdAt:new Date().toISOString()});persist();renderScenarioSelectors();renderComparison();toast('情景已保存，可以到“情景对比”查看。');}
function clearFilters(){for(const id of ['search','filter-region','filter-degree','filter-tier','filter-user-tier','filter-fit','filter-status'])$(id).value='';$('filter-short').checked=false;favoritesOnly=false;pageSize=18;renderPrograms();}
function exportBackup(){const data=JSON.stringify(state,null,2);const blob=new Blob([data],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`崔书赫的升学规划_备份_${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('备份已导出，包含经历档案、背景、情景、收藏和行动进度。');}
async function importBackup(file){if(!file)return;if(file.size>1024*1024){toast('备份文件过大，请选择本工具导出的 JSON。');return;}try{const imported=sanitizeState(JSON.parse(await file.text()));if(!confirm('导入将覆盖当前经历档案、背景、情景、收藏及行动清单。是否继续？'))return;state=imported;persist();refreshAll();toast('备份已导入。');}catch(error){toast(`未导入：${error.message||'文件格式不正确。'}`);}finally{$('import-file').value='';}}
function refreshAll(){refreshEvaluations();renderRibbon();renderStats();renderBackgroundForm();renderPlanning();renderTasks();renderCredits();renderScenarioSelectors();renderComparison();renderPrograms();renderPortfolio();}
function bindEvents(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));$('open-profile').onclick=()=>switchTab('profile');
  $('open-portfolio').onclick=()=>switchTab('portfolio');
  $('portfolio-add').onclick=()=>openPortfolioEditor();
  $('jump-target-gap').onclick=()=>$('target-gap-panel').scrollIntoView({behavior:'smooth',block:'start'});
  $('portfolio-search').addEventListener('input',event=>{portfolioQuery=event.target.value;renderPortfolio();});
  $('portfolio-category').addEventListener('change',event=>{portfolioFilter=event.target.value;renderPortfolio();});
  $('portfolio-confirmations').onclick=()=>{portfolioFilter='to-confirm';$('portfolio-category').value='to-confirm';renderPortfolio();};
  $('portfolio-list').addEventListener('click',event=>{const edit=event.target.closest('[data-edit-portfolio]');if(edit){openPortfolioEditor(edit.dataset.editPortfolio);return;}const del=event.target.closest('[data-delete-portfolio]');if(del)deletePortfolioItem(del.dataset.deletePortfolio);});
  $('portfolio-form').addEventListener('submit',savePortfolioEditor);
  $('portfolio-cancel').onclick=()=>$('portfolio-editor').close();
  $('portfolio-close').onclick=()=>$('portfolio-editor').close();
  $('target-program').addEventListener('change',event=>{targetProgramId=event.target.value;renderTargetGap();});
  for(const id of ['gpa-number','gpa-slider'])$(id).addEventListener('input',event=>{const n=Number(event.target.value);if(!Number.isFinite(n)||n<2||n>5){if(id==='gpa-number')event.target.setCustomValidity('请填写 2.00—5.00 的 GPA。');return;}event.target.setCustomValidity('');updateProfile('gpa',Math.round(n*100)/100);});
  $('gpa-number').addEventListener('blur',()=>{$('gpa-number').value=state.profile.gpa.toFixed(2);$('gpa-number').setCustomValidity('');});
  $('preset-current').onclick=()=>{updateProfile('gpa',4.1);toast('已切换到 GPA 4.1，其他背景不变。');};$('preset-target').onclick=()=>{updateProfile('gpa',4.5);toast('已切换到 GPA 4.5，其他背景不变。');};
  $('method-toggle').onclick=()=>{const open=$('method-box').hidden;$('method-box').hidden=!open;$('method-toggle').setAttribute('aria-expanded',String(open));};
  $('more-filters').onclick=()=>{const open=$('extra-filters').hidden;$('extra-filters').hidden=!open;$('more-filters').setAttribute('aria-expanded',String(open));};
  for(const id of ['search','filter-region','filter-degree','filter-tier','filter-user-tier','filter-fit','filter-status','filter-short'])$(id).addEventListener('input',()=>{pageSize=18;renderPrograms();});
  $('show-all').onclick=()=>{favoritesOnly=false;pageSize=18;renderPrograms();};$('show-favorites').onclick=()=>{favoritesOnly=true;pageSize=18;renderPrograms();};$('load-more').onclick=()=>{pageSize+=18;renderPrograms();};$('clear-filters').onclick=clearFilters;$('empty-clear').onclick=clearFilters;
  $('program-list').addEventListener('click',event=>{const favorite=event.target.closest('[data-favorite]');if(favorite){const id=favorite.dataset.favorite;state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];persist();renderPrograms();return;}const detail=event.target.closest('[data-details]');if(detail){const el=$(`detail-${detail.dataset.details}`);el.hidden=!el.hidden;detail.setAttribute('aria-expanded',String(!el.hidden));detail.textContent=el.hidden?'缺口与申请要求 ＋':'收起项目详情 −';}});
  $('program-list').addEventListener('change',event=>{if(event.target.dataset.status){state.statuses[event.target.dataset.status]=event.target.value;persist();if($('filter-status').value)renderPrograms();}});
  $('background-form').addEventListener('submit',e=>e.preventDefault());$('background-form').addEventListener('change',event=>{const input=event.target;if(!input.name)return;let v=input.type==='number'?Number(input.value):input.value;if(input.type==='number'&&!input.checkValidity()){input.reportValidity();return;}updateProfile(input.name,v);});
  $('task-list').addEventListener('change',event=>{if(event.target.dataset.task){const t=state.tasks.find(x=>x.id===event.target.dataset.task);if(t){t.done=event.target.checked;persist();renderTasks();}}});
  $('task-list').addEventListener('click',event=>{const b=event.target.closest('[data-delete-task]');if(b){state.tasks=state.tasks.filter(t=>t.id!==b.dataset.deleteTask);persist();renderTasks();}});
  $('add-task-form').addEventListener('submit',event=>{event.preventDefault();const title=$('new-task').value.trim();if(!title)return;if(state.tasks.length>=100){toast('行动清单已满，请先删去不再使用的自定义行动。');return;}state.tasks.push({id:`t${Date.now().toString(36)}`,title,detail:'',category:'自定义',done:false,custom:true});$('new-task').value='';persist();renderTasks();});
  $('credits-form').addEventListener('submit',e=>e.preventDefault());$('credits-form').addEventListener('input',event=>{const input=event.target;if(!input.name)return;state.credits[input.name]=input.value===''?null:Number(input.value);persist();renderCredits();});
  for(const id of ['save-scenario','save-scenario-2'])$(id).onclick=saveScenario;for(const id of ['compare-a','compare-b'])$(id).addEventListener('change',renderComparison);
  $('compare-preset').onclick=()=>{$('compare-a').value='gpa41';$('compare-b').value='gpa45';renderComparison();};
  $('scenario-list').addEventListener('click',event=>{const load=event.target.closest('[data-load-scenario]');if(load){const s=state.scenarios.find(x=>x.id===load.dataset.loadScenario);if(s){state.profile=clone(s.profile);persist();refreshAll();$('scenario-label').textContent=s.name;toast(`已载入情景：${s.name}`);}}const del=event.target.closest('[data-delete-scenario]');if(del&&confirm('删除这个已保存情景？当前正在编辑的背景不受影响。')){state.scenarios=state.scenarios.filter(s=>s.id!==del.dataset.deleteScenario);persist();renderScenarioSelectors();renderComparison();}});
  for(const id of ['export-sidebar','export-backup'])$(id).onclick=exportBackup;$('import-backup').onclick=()=>$('import-file').click();$('import-file').addEventListener('change',event=>importBackup(event.target.files[0]));
  $('reset-profile').onclick=()=>{if(confirm('恢复初始背景？收藏、申请进度、保存情景和行动清单仍保留。')){state.profile=clone(DEFAULT);persist();refreshAll();toast('已恢复初始背景。');}};
  window.addEventListener('online',()=>{if(cloudReady&&!cloudBlocked){cloudMode='ready';syncCloud();}else if(!cloudReady&&!cloudBlocked){initCloud();}});
}
async function init(){try{
  const [response,seedResponse]=await Promise.all([fetch('./programs.json',{cache:'no-cache'}),fetch('./portfolio-seed.json',{cache:'no-cache'})]);if(!seedResponse.ok)throw new Error('经历档案暂时无法加载，请刷新重试。');portfolioSeed=await seedResponse.json();if(!response.ok)throw new Error('项目资料暂时无法加载，请刷新重试。');const data=await response.json();programs=Array.isArray(data)?data:data.programs;if(!Array.isArray(programs)||!programs.length)throw new Error('项目数据格式不正确。');
  state=loadLocal();const ids=new Set(programs.map(p=>p.id));state.favorites=state.favorites.filter(id=>ids.has(id));
  for(const [id,list]of[['filter-region',[...new Set(programs.map(p=>p.region))]],['filter-tier',TIERS],['filter-user-tier',data.user_tiers||[...new Set(programs.map(p=>p.user_tier))]]])$(id).insertAdjacentHTML('beforeend',list.map(v=>`<option>${esc(v)}</option>`).join(''));
  $('data-date').textContent=String(data.as_of||'2026-11-09').replace(/-/g,'.');bindEvents();refreshAll();switchTab(location.hash.slice(1)||'schools');$('loading').hidden=true;$('app-content').hidden=false;
  await initCloud();
}catch(error){$('loading').hidden=true;$('fatal-error').hidden=false;$('fatal-error').innerHTML=`<strong>暂时无法打开申请工作台</strong><p>${esc(error.message)}</p><button class="button button-outline" id="reload-app">重新加载</button>`;$('reload-app').onclick=()=>location.reload();}}
init();
