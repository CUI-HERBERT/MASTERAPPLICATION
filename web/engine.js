/** Transparent scenario rules. No probability model or inferred admissions statistics. */
export const RULE_VERSION = '2026-11-09.1';
export const TIER_ORDER = ['冲刺中的冲刺','冲刺档','主申一档','主申二档','较稳备选','条件候选','成绩未达线'];
export const DEFAULT_PROFILE = Object.freeze({
  gpa: 4.1, coreTrend: 'rising', researchStage: 'in-progress', independence: 'lead',
  reproducibility: 'unknown', characterization: 'learning', batteryOutputs: 0,
  recommendation: 'promised', connections: Object.freeze({mit:'available',stanford:'available'}),
  englishStatus: 'expired', greStatus: 'planned', greScore: 330,
  researchAccess: 'unknown', prerequisitesConfirmed: false, intendedDegree: 'all', programEvidence: Object.freeze({}),
});
export const defaultProfile = DEFAULT_PROFILE;
const option = (value,label) => ({value,label});
export const PROFILE_OPTIONS = Object.freeze({
  coreTrend: [option('rising','核心课程持续上升'),option('stable','基本稳定'),option('falling','近期下降'),option('unknown','尚未整理')],
  researchStage: [option('in-progress','主导课题进行中'),option('repeatable','已有可重复的主要结果'),option('mechanism','对照和机制证据基本闭合'),option('manuscript','已形成完整稿件'),option('accepted','相关实验成果已接受或发表')],
  independence: [option('lead','主导问题与课题推进'),option('substantial','承担实质研究部分'),option('support','目前主要执行部分任务'),option('unknown','贡献尚未整理')],
  reproducibility: [option('unknown','重复与关键对照尚未确认'),option('initial','已有初步结果'),option('replicated','已有独立重复'),option('controlled','独立重复与关键对照齐全')],
  characterization: [option('learning','正在学习'),option('guided','在指导下完成并解释'),option('independent','能选择方法并独立解释主要证据')],
  recommendation: [option('promised','导师已承诺强推，申请信尚未形成'),option('specific','已有可写入信中的具体贡献证据'),option('comparative','具体贡献与同辈比较均有证据'),option('generic','目前只能提供一般性评价'),option('unknown','推荐安排未落实')],
  connection: [option('none','没有特定联系'),option('available','导师可以介绍或推荐'),option('feedback','目标方已有具体学术反馈')],
  englishStatus: [option('expired','旧成绩已过期'),option('moi-ready','可提供全英文授课证明'),option('valid','已有有效考试成绩'),option('unknown','尚未准备')],
  greStatus: [option('planned','计划成绩，尚未取得'),option('valid','已有有效正式成绩'),option('none','不准备提交')],
  researchAccess: [option('unknown','研究计划尚未完成'),option('prepared','研究摘要与后续计划已准备')],
  intendedDegree: [option('all','硕士与内地直博'),option('masters','仅硕士'),option('direct-phd','仅内地直博')],
});
export const POLICY_NOTES = Object.freeze([
  '建议档位是可解释的规则情景比较，不是录取概率或经过录取数据训练的预测。',
  '4.1与4.5沿用已有逐项目判断；两者之间保守参考4.1档，先处理已核官方成绩线。达到4.5后参考4.5档，超出锚点不自动继续降难度。',
  '软背景只在具体成果相互印证时最多调整一档；论文数量、头衔、GRE分数和导师关系不单独换算成录取加分。',
  '未确认的先修、身份通道、实践经历、研究席位和减免条件不会因提高GPA或推荐强度而消失。',
  '仅明确的目标校数字标准或计算规则用于成绩检查；字母档参照、别校换算、准备目标均不作准入线。',
]);

const rangeRank = t => TIER_ORDER.indexOf(t);
const competitive = t => rangeRank(t) >= 0 && rangeRank(t) <= 4;
const allText = p => [p.program,p.research,p.condition,p.supervisor,p.eligibility,p.prerequisites].filter(Boolean).join(' ');
const source = (p, pattern) => (p.sources || []).find(s => pattern.test(s)) || (p.sources || [])[0] || '';
const officialThresholds = Object.freeze({
  M007:4.5,M008:4.5,M009:4.25,M010:4.25,M011:4.25,M012:4,M013:4.25,M014:4,M015:4.5,M016:4,M017:4,M018:4.25,M019:4.5,M020:4,M021:4.25,M022:4,M023:4.25,M024:4.25,M025:4,
  M026:4,M027:4,M028:4,M030:4,M031:4.5,M032:4,M033:4.5,M035:4,M036:4,M037:4.5,M038:4,M039:4,M040:4,
  M051:4.3,M085:3.5,M095:3.5,M101:3.75,M102:3.75,M106:4,
  CN016:4.375,CN017:4.375,CN018:4.375,
});
export const GPA_RULES = Object.freeze(Object.fromEntries(Object.entries(officialThresholds).map(([id,minimum]) => [id, Object.freeze({minimum,mode:id.startsWith('CN')?'official-proportional-rule':id==='M101'||id==='M102'?'official-scale-rule':'official-published-reference'})])));
const METHODS_FIRST = new Set(['M008','M013','M014','M019','M023','M024','M025','M030','M033','M036','M037','M041','M042','M043','M065','M124']);
const NO_THESIS = new Set(['M001','M003','M054','M055','M058','M059','M068','M069','M075','M080','M082','M083','M089','M090','M091','M095','M107','M114','M115','M118','M119','M120','M121','M128','M132']);
const THESIS = new Set(['M002','M004','M011','M012','M016','M020','M026','M027','M028','M056','M057','M067','M076','M079','M081','M084','M097','M098','M099','M100','M101','M102','M106','M112','M113','M116','M129','M130']);
const NO_NUS_MOI = new Set(['M001','M074',...Array.from({length:19},(_,i)=>`M${String(i+7).padStart(3,'0')}`)]);
const TOP_CAP = new Set(['Massachusetts Institute of Technology','Princeton University']);
// Explicitly verified mandatory GRE routes in this dated catalogue; negative wording is never parsed as mandatory.
const GRE_REQUIRED = new Set(['M005','M051','M063','M064']);
const uniq = a => [...new Set(a.filter(Boolean))];
function flag(kind,label,detail){return {kind,label,detail};}

export function normalizeProfile(input = {}) {
  input = input && typeof input==='object' && !Array.isArray(input) ? input : {};
  const p = {...DEFAULT_PROFILE, ...input, connections:{...DEFAULT_PROFILE.connections,...input.connections},programEvidence:{...(input.programEvidence||{})}};
  const raw = Number(p.gpa);
  p.gpa = Number.isFinite(raw) ? Math.min(5,Math.max(2,raw)) : DEFAULT_PROFILE.gpa;
  p.batteryOutputs = Math.min(50,Math.max(0,Math.floor(Number(p.batteryOutputs)||0)));
  p.greScore = Math.min(340,Math.max(260,Number(p.greScore)||330));
  p.validationNotes = [];
  if (!Number.isFinite(raw) || raw<2 || raw>5) p.validationNotes.push('GPA输入须在2.00—5.00之间，当前已使用范围内的参考值。');
  for (const key of ['coreTrend','researchStage','independence','reproducibility','characterization','recommendation','englishStatus','greStatus','researchAccess','intendedDegree']) {
    if (!PROFILE_OPTIONS[key].some(o=>o.value===p[key])) {p[key]=DEFAULT_PROFILE[key];p.validationNotes.push(`已恢复${key}的默认选项。`);}
  }
  for(const key of ['mit','stanford'])if(!PROFILE_OPTIONS.connection.some(o=>o.value===p.connections[key]))p.connections[key]='none';
  return p;
}

export function getGpaGate(program, profile) {
  const p = normalizeProfile(profile);
  const rule = GPA_RULES[program.id];
  if (rule) return {
    status:p.gpa + 1e-9 < rule.minimum ? 'below':'met',minimum:rule.minimum,mode:rule.mode,
    source:source(program,/international.qualifications|singapore|admission|2832|country/i),
    label:p.gpa + 1e-9 < rule.minimum ? '低于已核成绩参考':'达到已核成绩参考',
    detail:`NUS ${rule.minimum.toFixed(rule.minimum===4.375?3:2)}/5。依据项目资料中的目标校标准／规则，仍须正式审核完整学历及申请年度。`,
    checked:program.checked || '',
  };
  if(program.id==='M126')return {
    status:p.gpa+1e-9<2.9?'guide-below':'guide-met',minimum:2.9,mode:'official-calculator-guide',
    source:'https://admissions.unsw.edu.au/PGCalculators/numCalculator.php',label:'官方计算器指导值',
    detail:'UNSW数值工具按NUS满分5、最低毕业GPA2计算，65%约为2.90。是指导值，不能替代正式录取、认证及一年路线审批。',checked:program.checked || '',
  };
  return {status:'unknown',minimum:null,mode:'unverified-numeric-equivalence',source:source(program,/admission|requirement|entry/i),label:'无可直接使用的官方NUS数字线',detail:program.nus_official || '学校未公布已核NUS数字等值；不使用辅助换算作硬门槛。',checked:program.checked || ''};
}

function getResearchMode(program) {
  if(['M092','M093','M094','M096'].includes(program.id))return 'substantial-project';
  if(program.degree_type==='内地直博')return 'thesis';
  if(NO_THESIS.has(program.id))return 'coursework-or-professional';
  if(THESIS.has(program.id))return 'thesis';
  return 'project-or-optional';
}
function getGreEffect(program, profile) {
  const text=program.gre || '';
  if(GRE_REQUIRED.has(program.id))return {status:profile.greStatus==='valid'?'document-ready':'action-needed',label:profile.greStatus==='valid'?'已录入有效GRE，仍核分项':'需要正式GRE材料',detail:text};
  // A caution such as “未列GRE，不能据此宣称不接受” is not an affirmative rejection policy.
  const notConsidered=text.split(/[；;。\n]/).some(clause=>
    !/不能|不可|不应|不代表|不等于|未确认|未核|未证实|cannot|does not imply|not verified|not established/i.test(clause) &&
    /not accepted|not considered|不接受|不考虑|不使用|提交不会增加评审优先/i.test(clause));
  if(notConsidered)return {status:'not-considered',label:'GRE不用于提档',detail:text};
  return {status:'not-weighted',label:'本版不把GRE分数换成档位加成',detail:text || '未核到可量化的GRE录取权重。'};
}
function getLanguageStatus(program,profile) {
  const evidence=profile.programEvidence[program.id]||{};
  if(evidence.language==='confirmed')return {status:'confirmed',label:'已记录本项目语言条件确认',detail:'请保留招生办公室或申请系统确认记录，并核对适用入学年份。'};
  if(profile.englishStatus==='valid')return {status:'document-ready',label:'已有有效成绩，需核分项',detail:program.english || '核对本项目成绩、分项、有效期与接受考试类别。'};
  if(profile.englishStatus==='moi-ready'&&!NO_NUS_MOI.has(program.id))return {status:'moi-review',label:'全英文证明待本项目审核',detail:program.nus_waiver || 'MOI已准备，不能据此自动认定豁免。'};
  return {status:'action-needed',label:NO_NUS_MOI.has(program.id)?'需准备本项目接受的语言材料':'更新语言成绩或学历证明',detail:program.nus_waiver || program.english || '本项目语言要求待核。'};
}
function chooseAnchor(program,profile,gate) {
  let tier = profile.gpa>=4.5 ? program.tier45:program.tier41;
  const note=profile.gpa>=4.5?'参考已有4.5情形判断':'保守参考已有4.1情形判断';
  if(!tier)tier='条件候选';
  if(tier==='成绩未达线'&&gate.status!=='below') {
    if(gate.status==='met') {
      tier=program.tier45 || '条件候选';
      if(competitive(tier)&&profile.gpa<4.5)tier=TIER_ORDER[Math.max(0,rangeRank(tier)-1)];
      return {tier,note:'已解除该项数字成绩限制；竞争档保守参考4.5情形，仍考虑未达到4.5的差距。'};
    }
    // Never carry a historical hard-grade verdict without a currently verified gate.
    tier=competitive(program.tier45)?TIER_ORDER[Math.max(0,rangeRank(program.tier45)-1)]:'条件候选';
    return {tier,note:'历史记录曾有成绩疑问，本版未取得可用数字门槛，不据辅助等值判定不合格。'};
  }
  if(profile.gpa<4.1&&competitive(tier))tier=TIER_ORDER[Math.max(0,rangeRank(tier)-1)];
  return {tier,note};
}

export function evaluateProgram(program, input = {}) {
  const p=normalizeProfile(input);
  const gate=getGpaGate(program,p);
  const anchor=chooseAnchor(program,p,gate);
  let tier=anchor.tier;
  const reasons=[anchor.note], nextSteps=[], flags=[];
  const evidence=p.programEvidence[program.id]||{};
  const researchMode=getResearchMode(program);
  const methodsFirst=METHODS_FIRST.has(program.id);
  const researchRelevant=['thesis','substantial-project','project-or-optional'].includes(researchMode)&&!methodsFirst&&program.fit_priority==='高';
  const strongResearch=['mechanism','manuscript','accepted'].includes(p.researchStage)
    &&['lead','substantial'].includes(p.independence)&&p.reproducibility==='controlled'
    &&p.characterization==='independent'&&['specific','comparative'].includes(p.recommendation);
  const weakResearch=researchRelevant&&(p.independence==='support'||p.recommendation==='generic');
  const greEffect=getGreEffect(program,p);
  const languageStatus=getLanguageStatus(program,p);
  const baselineConditional=program.tier45==='条件候选';
  if(p.gpa<4.1||p.gpa>4.5)flags.push(flag('uncertainty','超出原始GPA锚点',p.gpa<4.1?'低于4.1仅作一档保守外推；没有据此推断精确录取率。':'高于4.5沿用4.5判断，不继续自动提档。'));
  if(p.gpa>4.1&&p.gpa<4.5)flags.push(flag('info','GPA处于两档之间','不伪造连续录取曲线；沿用较保守的4.1锚点，已核官方成绩线单独更新。'));
  if(gate.status==='below') {
    tier='成绩未达线';
    reasons.push(`当前${p.gpa.toFixed(2)}低于本项目资料中的${gate.minimum}/5成绩参考；软背景不抵消这项限制。`);
    nextSteps.push(`先达到${gate.minimum}/5参考，或取得招生方对正式等值／例外适用的书面确认。`);
    flags.push(flag('requirement','成绩参考未达',gate.detail));
  } else if(gate.status==='guide-below') {
    tier='条件候选';
    reasons.push('低于UNSW工具的指导值；需招生方正式核算，不能用其他软背景直接认定符合。');
    nextSteps.push('向学校核实正式成绩核算及一年减免资格。');
  } else {
    if(gate.status==='met')reasons.push(`当前达到已核${gate.minimum}/5成绩参考；这一步不表示录取或其他条件已经满足。`);
    if(baselineConditional) {
      tier='条件候选';
      reasons.push('原名单有项目特定条件；提高GPA、论文或推荐强度不会自动解除。');
      nextSteps.push(program.condition || '先核实该项目的关键准入条件。');
      flags.push(flag('condition','项目条件仍需落实',program.condition || program.prerequisites || '核实正式项目入口。'));
      if(evidence.conditions==='confirmed')reasons.push('已记录你对条件的确认；本版保留条件档，待按具体证据重新人工判断。');
    } else if(competitive(tier)) {
      let shift=0;
      if(p.coreTrend==='falling'||weakResearch) {
        shift=-1;
        reasons.push(p.coreTrend==='falling'?'近期核心课程下降，暂作一档保守调整；先稳定课程表现。':'对研究路线，当前贡献或推荐具体性尚弱，暂作一档保守调整。');
      } else if(strongResearch&&researchRelevant) {
        shift=1;
        reasons.push('独立贡献、关键对照与重复、表征解释及具体推荐相互支持，研究相关路线最多改善一档。');
      }
      if(shift)tier=TIER_ORDER[Math.min(4,Math.max(0,rangeRank(tier)+shift))];
      if(TOP_CAP.has(program.school))tier='冲刺中的冲刺';
      if(program.school==='Stanford University'&&rangeRank(tier)>1)tier='冲刺档';
      if(['University of Cambridge','University of Oxford','Harvard University'].includes(program.school)&&rangeRank(tier)>2)tier='主申一档';
    }
  }
  if(p.researchStage==='accepted'&&p.batteryOutputs===0)flags.push(flag('evidence','成果状态与数量待核','你选择了已接受实验成果，但对应数量仍为0；不会自动计入论文加成。'));
  if(p.batteryOutputs>0)reasons.push(`录入${p.batteryOutputs}项已接受／发表电池实验成果；数量不直接换算档位，仍看贡献与证据。`);
  if(!strongResearch&&researchRelevant)nextSteps.push('把一个主课题做成可解释的研究闭环：明确问题、关键对照、独立重复、适当表征及你的贡献。');
  if(methodsFirst) {
    flags.push(flag('fit','需补方法／学科先修','电池实验经历不直接替代本项目的数学、计算、物理或相关方法课程。'));
    nextSteps.push('逐门核对方法及学科先修，并准备对应课程或实质项目证据。');
  }
  if(['M118','M119'].includes(program.id))flags.push(flag('research-path','另有论文计划需申请',program.research));
  if(researchMode==='coursework-or-professional')flags.push(flag('fit','课程／实践路线','该路线的研究量与实验室位置须另核；已有电池科研不会使它自动成为论文硕士。'));
  const conditionText=program.condition || '';
  if(conditionText&&!baselineConditional)flags.push(flag('condition','保留项目条件',conditionText));
  if(/导师|supervisor|教授|PI|Acceptance|consent/i.test(program.supervisor||'')) {
    if(evidence.supervisor==='confirmed')reasons.push('已记录本项目导师支持；它仍不替代院系正式录取、名额或资助审批。');
    else nextSteps.push('按本项目要求核实导师／研究席位及联系流程；课程录取不保证论文或电池实验位置。');
  }
  if(p.prerequisitesConfirmed||evidence.prerequisites==='confirmed')reasons.push(evidence.prerequisites==='confirmed'?'已记录本项目先修确认，仍须招生方最终认定。':'已整理先修资料；不会把全局开关当作所有项目均已认可。');
  const connectionKey=program.school==='Massachusetts Institute of Technology'?'mit':program.school==='Stanford University'?'stanford':null;
  if(connectionKey&&p.connections[connectionKey]!=='none') {
    const feedback=p.connections[connectionKey]==='feedback';
    reasons.push(feedback?'目标方已有具体学术反馈，可用于证明匹配；仍不是接收或录取。':'导师可提供介绍／强推，当前作为关系背景记录，尚不等于目标方反馈或录取。');
    nextSteps.push('把推荐关系转成具体贡献、可比较表现与研究匹配的材料，并按本项目正式流程申请。');
  }
  if(['promised','unknown'].includes(p.recommendation))nextSteps.push('给推荐人准备研究摘要、贡献清单与关键结果，争取具体评价；承诺强推暂不当成已形成的推荐证据。');
  if(greEffect.status==='action-needed') {
    flags.push(flag('document','GRE材料待完成',greEffect.detail));
    nextSteps.push('该项目要求GRE：取得有效正式成绩并核所有分项；计划330不作为已取得。');
  }
  if(greEffect.status==='not-considered'&&p.greStatus==='valid')reasons.push('该项目不接受／不考虑GRE，录入高分不会改变此项评估。');
  if(languageStatus.status==='action-needed'||languageStatus.status==='moi-review') {
    flags.push(flag('document',languageStatus.label,languageStatus.detail));
    nextSteps.push(languageStatus.status==='moi-review'?'递交正式MOI并逐项目确认是否满足语言条件及有效期。':'按本项目要求安排有效英语成绩或可接受的学历证明。');
  }
  if(p.researchAccess==='prepared')reasons.push('研究摘要与计划已准备，有利于沟通；不会据此认定已获得目标实验室席位。');
  const researchFit=methodsFirst?'方法／学科先修需核':researchMode==='thesis'?'含必修论文研究':researchMode==='substantial-project'?'含较大必修研究项目':researchMode==='coursework-or-professional'?'课程／实践为主':'研究项目或可选论文需核';
  const result={tier,baselineTier:anchor.tier,userTier:program.user_tier,anchor41:program.tier41,anchor45:program.tier45,
    reasons:uniq(reasons),nextSteps:uniq(nextSteps).slice(0,6),flags,gpaGate:gate,researchMode,researchFit,
    greEffect,languageStatus,changed:tier!==anchor.tier,ruleVersion:RULE_VERSION,
    uncertainty:'依据现有逐项目资料与可解释规则作情景比较；无数字录取率。官方要求未随输入实时联网更新。',
    validationNotes:p.validationNotes,
  };
  return {...program,...result,evaluation:result};
}

export function evaluatePrograms(programs,profile={}) {
  const p=normalizeProfile(profile);
  return programs.filter(x=>p.intendedDegree==='all'||(p.intendedDegree==='masters'?x.degree_type==='硕士':x.degree_type==='内地直博'))
    .map(x=>evaluateProgram(x,p));
}
export function summarize(evaluated=[]) {
  const byTier=Object.fromEntries(TIER_ORDER.map(t=>[t,0]));
  for(const p of evaluated)byTier[p.tier]=(byTier[p.tier]||0)+1;
  return {total:evaluated.length,byTier,
    hardGpaBelow:evaluated.filter(p=>p.gpaGate.status==='below').length,
    conditional:evaluated.filter(p=>p.tier==='条件候选').length,
    languageAction:evaluated.filter(p=>['action-needed','moi-review'].includes(p.languageStatus.status)).length,
    changed:evaluated.filter(p=>p.changed).length,
    researchPriority:evaluated.filter(p=>['thesis','substantial-project'].includes(p.researchMode)&&!METHODS_FIRST.has(p.id)).length,
  };
}
export function getPlanningSuggestions(input={},evaluated=[]) {
  const p=normalizeProfile(input), summary=summarize(evaluated), plans=[];
  plans.push({id:'coursework',priority:1,category:'课程',title:p.gpa>=4.5?'稳住4.5与核心课程':'先把课程与自学放在中心',why:p.gpa>=4.5?'成绩已达到原先目标，继续上升的边际收益要与研究质量和休息平衡。':'4.5是你已有目标；若核心专业课仍不稳定，增加活动或论文头衔难以替代课程证据。',action:'按学分与薄弱程度安排本学期专业课，复盘失分，保留高年级持续上升的成绩记录。'});
  if(p.reproducibility!=='controlled'||p.characterization!=='independent'||p.researchStage==='in-progress')plans.push({id:'research',priority:2,category:'科研',title:'完成一个电池主课题的证据闭环',why:'你已经主导课题；下一步价值在问题判断与结果解释，不在再增加课题名称。',action:'写清问题与被推翻的假设，建立关键对照及独立重复，按问题选择表征，并说明结论边界。实验发表目标与当前已完成成果分开记录。'});
  plans.push({id:'recommendation',priority:3,category:'推荐',title:'把强推承诺转为具体推荐材料',why:'长期指导关系与MIT／Stanford联系是可用资源；有说服力的是老师能举出你的研究判断和独立贡献。',action:'准备一页研究摘要、贡献清单、2—3张关键图及一次推翻假设的例子，定期请导师反馈。没有目标方具体回复时，仍记为可介绍关系。'});
  plans.push({id:'leadership',priority:4,category:'软背景',title:'让国创赛负责经历服务科研主线',why:'你负责团队统筹、企业和顾问对接，这些已有经历足以形成领导力证据，不必为申请额外堆职位。',action:'记录一次技术取舍、一次协调困难和产生的实际结果；把职责写成你如何判断、协调及推进。课程优先，压缩低收益的重复性对接。'});
  plans.push({id:'communication',priority:5,category:'表达',title:'建立可展示的研究材料',why:'会议报告、海报和组会能证明你把复杂研究讲清楚；具体内容比展示次数更重要。',action:'维护一页CV、简短研究摘要与5页研究讲稿，练习用3分钟解释问题、证据、局限和下一步。论文状态与自己的贡献逐项注明。'});
  if(p.englishStatus!=='valid')plans.push({id:'language',priority:6,category:'申请材料',title:'逐项目处理英语，不默认NUS全免',why:`当前${summary.languageAction}个已评项目仍需语言材料确认；不同项目接受MOI和考试的方式不同。`,action:'整理NUS正式全英文授课证明。对必须考试的目标项目，再按申请年份倒排考试及有效期；GRE仅为实际要求它的项目投入。'});
  plans.push({id:'research-access',priority:7,category:'选项目',title:'短硕同时比较研究时间与PhD申请时序',why:'一年或一年半节省时间，但课程录取不一定提供足够的实验及推荐积累。',action:'逐个确认论文／项目学分、导师与设备、开题时间、正式授位时间，再判断能否在下一轮PhD申请前形成可用成果。入学年份未定时先按相对里程碑规划。'});
  return plans;
}
