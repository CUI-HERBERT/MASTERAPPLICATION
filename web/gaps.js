/** Programme gaps use the dated catalogue; improvement targets are planning assumptions, not admission cutoffs. */
import { evaluateProgram, normalizeProfile } from './engine.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const cut = (value, max=240) => { const s=text(value); return s.length>max?`${s.slice(0,max)}…`:s; };
const uniq = values => [...new Set(values.filter(Boolean))];
const category = item => text(item.category);
const accepted = item => {
  const s=text(item.status);
  if(/未|尚|待|预计|预期|目标|投稿|审稿|review|submitted|planned|in.progress|draft|准备|不确定|需核|待核|接受或|发表或|发表\/接受|发表／接受/i.test(s))return false;
  return /^(published|accepted|已发表|已接受|正式发表|正式接受|已录用|已接收)([（(：:].*)?$/i.test(s);
};
const experimental = item => item.relevance==='battery-experimental';
const materialOrBattery = item => ['battery-experimental','battery-ml','materials'].includes(item.relevance);
const declaredLead = item => /first|corresponding|lead|第一|一作|通讯|主导|负责人/i.test(text(item.role)) && text(item.contribution).length>=12;
const formedLetter = item => {
  const s=text(item.status);
  return !/未|待|承诺|可|预计|planned|promised|unknown|待核/i.test(s) && /推荐信.*(完成|形成|提交)|已(完成|提交|形成).*推荐|letter.*(completed|submitted)|submitted|completed/i.test(s);
};
const directKnowledge = item => {
  const evidence=[item.role,item.contribution,item.evidence].map(text).join(' ');
  const context=[evidence,item.status,item.notes].map(text).join(' ');
  const unsupported=/无直接科研指导|没有直接科研指导|未直接指导|无直接指导|no direct|尚未提供|未建立直接科研指导|直接科研了解[^。；]{0,40}待确认/i.test(context);
  return !unsupported && /指导|supervis|共同研究|合作研究|实验|课题|科研决策|研究判断/i.test(evidence);
};
// A relationship already described by the user is a real candidate even when its person's name is pending.
// Exclude only an empty/whole-placeholder record, rather than any title containing “姓名待补”.
const wholePlaceholder = /^(?:待补(?:充)?(?:论文题目|题目|标题|姓名|记录)?|待确认|未知|unknown(?: title)?|placeholder(?: title)?)$/i;
const positiveRecord = item => [item.title,item.organization].some(v=>text(v)) && !wholePlaceholder.test(text(item.title));
const namePending = item => /姓名[^）)]*(?:待补|待确认|未提供|未知)|(?:待补|待确认|未知)[^）)]*姓名|name[^)]*(?:pending|unknown|unconfirmed)/i.test(text(item.title));

export function summarizePortfolio(items=[]) {
  const valid=Array.isArray(items)?items.filter(i=>i && typeof i==='object' && !Array.isArray(i)):[];
  const papers=valid.filter(i=>category(i)==='paper'&&positiveRecord(i));
  const relevant=papers.filter(materialOrBattery);
  const acceptedExperimental=papers.filter(i=>experimental(i)&&accepted(i));
  const experimentalLeads=acceptedExperimental.filter(declaredLead);
  const recommenders=valid.filter(i=>category(i)==='recommender'&&positiveRecord(i));
  const namedRecommenders=recommenders.filter(i=>!namePending(i));
  return {
    paperCount:papers.length,
    relevantPaperCount:relevant.length,
    acceptedExperimentalCount:acceptedExperimental.length,
    acceptedExperimentalLeadCount:experimentalLeads.length,
    batteryMLCount:papers.filter(i=>i.relevance==='battery-ml').length,
    recommenderCount:recommenders.length,
    namedRecommenderCount:namedRecommenders.length,
    unnamedRecommenderCount:recommenders.length-namedRecommenders.length,
    formedLetterCount:namedRecommenders.filter(formedLetter).length,
    directKnowledgeCount:recommenders.filter(directKnowledge).length,
    formedDirectLetterCount:namedRecommenders.filter(i=>formedLetter(i)&&directKnowledge(i)).length,
    paperIds:papers.map(i=>text(i.id)).filter(Boolean),
    acceptedExperimentalIds:acceptedExperimental.map(i=>text(i.id)).filter(Boolean),
    experimentalLeadIds:experimentalLeads.map(i=>text(i.id)).filter(Boolean),
    recommenderIds:recommenders.map(i=>text(i.id)).filter(Boolean),
    paperTitles:relevant.slice(0,3).map(i=>cut(i.title,110)),
    uncertainties:valid.filter(i=>i.verification==='to-confirm').map(i=>text(i.id)).filter(Boolean),
    items:valid,
  };
}

// Match narrowly. A generic “requirements” URL may be about grades, not language or GRE.
// When there is no field-specific URL, identify the programme's source bundle instead of asserting exact attribution.
const sourceFor = (record, pattern, label) => {
  const exact=(record.sources||[]).find(s=>pattern.test(s)&&!/minimum[-_]grade|international[-_]qualifications/i.test(s));
  return {url:exact||(record.sources||[])[0]||'',label:exact?(label||'项目来源（合并核对）'):'项目来源（合并核对）'};
};
const refCount = record => {
  const raw=text(record.refs_documents);
  if(/不.*(?:固定|统一).*数量|未.*(?:固定|统一).*数量|No.*fixed.*(?:count|number)|No recommendation letters|未列.*推荐/i.test(raw))return null;
  const m=raw.match(/([1-4])\s*封推荐|([1-4])\s*(?:letters?\s+of\s+recommendation|recommendation\s+letters?)/i);
  if(m)return Number(m[1]||m[2]);
  if(/两名|两位/.test(raw))return 2;
  if(/三名|三位/.test(raw))return 3;
  return null;
};
const titleList = items => items.slice(0,3).map(i=>`${cut(i.title,80)}${text(i.status)?`（${cut(i.status,40)}）`:''}`).join('；');

export function buildProgramGapAnalysis(record, input={}, portfolioItems=[]) {
  const profile=normalizeProfile(input);
  const result=evaluateProgram(record,profile);
  const portfolio=summarizePortfolio(portfolioItems);
  const evidence=profile.programEvidence[record.id]||{};
  const gaps=[];
  const add=(id,kind,title,current,target,impact,status,basis='planning',evidenceIds=[],source='')=>gaps.push({id,kind,title,current,target,impact,status,basis,evidenceIds,
    source:typeof source==='string'?source:source.url,
    sourceLabel:typeof source==='string'?'成绩参考来源':source.label,
    sources:[...(record.sources||[])],checked:record.checked||''});
  const gate=result.gpaGate;
  const official=gate.minimum!==null && !gate.mode.includes('guide');
  if(official) {
    const below=gate.status==='below';
    add('gpa','academic','成绩参考与个人目标',`当前NUS GPA ${profile.gpa.toFixed(2)}/5；${gate.label}。`,
      `官方已核参考 ${gate.minimum}/5。${profile.gpa<4.5?'个人规划另以4.50/5及高年级核心课程持续上升为目标；4.50不是新增的官方门槛。':'保持核心课程表现，不把继续加GPA机械换算成提档。'}`,
      below?'先解除成绩限制；强推、GRE和论文不能自动抵消此项。':'仅表示达到已核成绩参考，仍须审查学历、先修和整体竞争力。',below?'missing':'complete','official',[],gate.source);
  } else {
    add('gpa','academic','成绩竞争力与等值核算',`当前NUS GPA ${profile.gpa.toFixed(2)}/5；${gate.label}。${cut(gate.detail,260)}`,
      profile.gpa<4.5?'建议争取累计4.50/5及核心专业课持续上升，作为个人情景目标；不是本项目官方最低分。申请时提交完整成绩单及评分说明。':'维持核心专业课和完整成绩证明；不生成学校未公布的NUS数字门槛。',
      gate.mode.includes('guide')?'官方工具仅供指导；一年路线、减免和最终等值仍需正式审批。':'无官方NUS数字线不表示没有学业要求，也不使用简单线性换算判定合格。','to-confirm','planning',[],gate.source);
  }

  const language=result.languageStatus;
  add('language','document','英语材料',`${language.label}。${profile.englishStatus==='expired'?'已提供的旧成绩过期。':''}`,
    text(record.english)||text(record.nus_waiver)||'向项目核实接受考试、总分、分项、有效期及MOI政策。',
    language.status==='confirmed'?'已记录本项目确认；保留适用申请年份的书面材料。':'补齐本项目的正式材料条件；NUS全英文教学不自动等于每个院系豁免。',
    language.status==='confirmed'?'complete':language.status==='action-needed'?'missing':'to-confirm','official',[],sourceFor(record,/english|language|test[-_]scores/i,'语言政策来源'));

  const gre=result.greEffect;
  const greRaw=text(record.gre);
  const optional=/optional|可选|自愿/i.test(greRaw);
  const explicitlyNoRequirement=/not required|不要求|无需|不必/i.test(greRaw)&&!/未列|未公布|未找到/.test(greRaw);
  const greReady=profile.greStatus==='valid';
  add('gre','document','GRE要求与实际状态',
    `${greReady?`已录入有效正式GRE ${profile.greScore}`:profile.greStatus==='planned'?`GRE ${profile.greScore}是计划成绩，尚未取得`:'目前不准备提交GRE'}。${gre.label}。`,
    gre.status==='action-needed'||gre.status==='document-ready'?`${greRaw}；取得正式成绩并核对Q/V/AW、送分及有效期。`:gre.status==='not-considered'?greRaw:optional?`${greRaw}；如提交应为有效正式成绩；不设自创的“提档分”。`:explicitlyNoRequirement?greRaw:`${greRaw||'目录未取得明确要求。'} 申请年度复核，未列不等于不接受或正式豁免。`,
    gre.status==='not-considered'?'本项目不考虑GRE，提高分数不会改善此项判断。':gre.status==='action-needed'||gre.status==='document-ready'?'完成必交材料；高分不替代成绩、先修或研究证据。':'本版不把计划330或更高分换成档位加成。',
    gre.status==='not-considered'?'not-applicable':gre.status==='action-needed'?'missing':gre.status==='document-ready'?'to-confirm':optional||explicitlyNoRequirement?'not-applicable':'to-confirm','official',[],sourceFor(record,/\bgre\b|test[-_]scores/i,'考试政策来源'));

  const methodsFirst=result.flags.some(f=>f.kind==='fit'&&/方法|先修/.test(f.label));
  const prerequisitesReady=evidence.prerequisites==='confirmed';
  add('prerequisites','academic',methodsFirst?'方法与学科先修':'学位与课程先修',
    prerequisitesReady?'已记录本项目先修确认；须保留招生方认可依据。':`已知本科为NUS化工；${profile.prerequisitesConfirmed?'你已整理全局先修资料，但尚未逐项目确认。':'尚未记录本项目逐门课程对应与认可。'}`,
    `${text(record.prerequisites)||'按本项目学位及课程背景要求逐项核对。'}${methodsFirst?' 建议制作课程—要求对应清单，并提供一个可复现的方法项目，说明数据划分、基线、消融及你的算法贡献。':' 建议以成绩单、课程大纲和项目贡献对应相关要求。'}`,
    methodsFirst?'电池实验及应用型ML文章不能自动替代数学、算法或计算基础。':'这是专业匹配与资格审查；增加头衔或活动数量不能直接解除。',
    prerequisitesReady?'complete':'to-confirm','official',[],sourceFor(record,/academic[-_]requirements|requirement[-_]profile|prerequisite/i,'专业先修来源'));

  const isResearch=['thesis','substantial-project','project-or-optional'].includes(result.researchMode);
  const primaryResearch=isResearch&&!methodsFirst&&record.fit_priority==='高';
  const researchClosed=['mechanism','manuscript','accepted'].includes(profile.researchStage)&&['lead','substantial'].includes(profile.independence)&&profile.reproducibility==='controlled'&&profile.characterization==='independent';
  const contributionLabel={lead:'已主导问题与课题推进',substantial:'已承担实质研究部分',support:'目前主要执行部分任务',unknown:'贡献尚未整理'}[profile.independence];
  const researchCurrent=primaryResearch
    ?`你${contributionLabel}；本页按背景表中的阶段判断。独立重复/关键对照：${profile.reproducibility==='controlled'?'已录入齐全':profile.reproducibility==='unknown'?'尚未确认':'尚在补充'}；主要表征解释：${profile.characterization==='independent'?'已录入可独立解释':'仍需学习或指导'}。档案登记${portfolio.paperCount}篇论文，其中明确记录已接受/发表的电池实验论文${portfolio.acceptedExperimentalCount}篇；数量本身不提档。${portfolio.acceptedExperimentalLeadCount&&!researchClosed?'档案已有实验论文主导贡献条目；请到“背景与规划”核实独立重复、关键对照及表征深度，条目状态不代替这些证据。':''}`
    :methodsFirst?`档案已有${portfolio.batteryMLCount}篇电池ML相关条目；需核实方法贡献、可复现性及本项目学科准备。`
    :`已登记${portfolio.paperCount}篇论文。该路线${result.researchMode==='coursework-or-professional'?'以课程或实践为主，不把再发论文设为必需条件':'的论文/研究项目属于选项或需另行安排'}。`;
  add('research','research',primaryResearch?'电池研究的证据闭环':methodsFirst?'方法贡献与研究样本':'项目适配的技术与实践证据',researchCurrent,
    primaryResearch?'建议补到：一页问题—假设—关键对照—独立重复—表征—结论边界的研究摘要；2–3张有原始数据支撑的关键图；说明一次推翻假设的判断及你负责的部分。重复数量与表征方法由具体问题决定，不设通用“做三次即达标”。'
      :methodsFirst?'建议补到：一个能独立解释并复现的方法项目，保留代码、数据来源、训练/测试隔离、基线和消融；以课程成绩证明数学与计算准备。应用论文篇数不替代这些证据。'
      :'建议补到：选取1–2项最相关的电池、化工或材料项目，写清技术问题、个人决策、验证过程和实际结果；课程/实践项目不要求你另凑实验论文。',
    primaryResearch?'当研究深度、独立贡献、可重复证据和具体推荐互相支持时，规则最多改善一档；不要求先发表某个分区。':'用于证明适配；不因论文、奖项或职位增加而自动提档。',
    primaryResearch?(researchClosed?'complete':profile.reproducibility==='unknown'?'to-confirm':'developing'):'to-confirm','planning',portfolio.paperIds);

  const requiredLetters=refCount(record);
  const recommenderReady=requiredLetters!==null&&portfolio.formedLetterCount>=requiredLetters&&portfolio.formedDirectLetterCount>=Math.min(2,requiredLetters)&&['specific','comparative'].includes(profile.recommendation);
  const candidates=portfolio.items.filter(i=>category(i)==='recommender'&&positiveRecord(i));
  add('recommendations','recommendation','推荐信的具体证据',
    `已登记${portfolio.recommenderCount}位候选推荐人（姓名已填写${portfolio.namedRecommenderCount}位、姓名待补${portfolio.unnamedRecommenderCount}位）；其中${portfolio.directKnowledgeCount}位的记录涉及直接指导/研究合作，${portfolio.formedLetterCount}封已落实姓名并明确标记已形成或提交。${profile.recommendation==='promised'?'当前强推仍是导师承诺，申请信尚未形成。':''}${candidates.length?`候选：${titleList(candidates)}。`:''}`,
    `${text(record.refs_documents)||'按申请系统核实推荐人与材料要求。'} 建议把现有承诺补成可引用的研究决策、独立贡献和同辈比较；向老师提供一页摘要、贡献清单及关键结果。优先能直接评价你的人，而非仅看职位。`,
    '具体推荐可支持研究能力判断；名望、关系或承诺强推不单独消除成绩及名额限制。候选人数不等于推荐信已落实。',recommenderReady?'complete':'developing','planning',portfolio.recommenderIds,sourceFor(record,/recommend|letters/i,'推荐材料来源'));

  const supervisorConfirmed=evidence.supervisor==='confirmed';
  const conditionsConfirmed=evidence.conditions==='confirmed';
  const baselineConditional=record.tier45==='条件候选';
  add('route','route','导师、研究位置与路线条件',
    supervisorConfirmed?'已记录本项目导师支持；还须核正式录取、资源及资助审批。':`尚未记录本项目正式研究位置。${text(record.research)||text(record.research_access)||''}`,
    [text(record.supervisor),text(record.condition)].filter(Boolean).join('；')||'向项目确认论文/项目安排、导师匹配和实际研究时间。',
    baselineConditional?'达到成绩参考后，本项目仍有结构或资格条件，按规则为“条件候选”；需按具体书面证据人工复核。':isResearch?'先明确入学与研究席位分别怎样审批；硕士录取不自动保证电池课题或内部转博。':'如果目的是后续PhD，另核实验/论文是否可选及何时能获得研究推荐。',
    baselineConditional?(conditionsConfirmed?'to-confirm':'missing'):supervisorConfirmed?'complete':'to-confirm','planning',[],sourceFor(record,/curriculum|degree[-_]requirements|program[-_]details|masters-degree/i));

  const support=portfolio.items.filter(i=>['competition','internship','award'].includes(category(i))&&positiveRecord(i));
  add('supporting-evidence','portfolio','竞赛、实习与奖项如何使用',
    support.length?`已有${support.length}项辅助经历：${titleList(support)}。`:'尚未登记此类经历。',
    '从现有经历中挑最相关的例子：国创赛写清技术取舍与统筹结果；实习写清实际任务、方法和产出；奖项按证书准确写级别与日期。尚未公布的比赛结果保留为参赛/网评中。',
    '服务化工/材料研究主线与表达能力，不要求为申请额外堆活动；不会单靠新增奖项或头衔改善档位。',support.length?'developing':'to-confirm','planning',support.map(i=>text(i.id)).filter(Boolean));

  const key=record.school==='Massachusetts Institute of Technology'?'mit':record.school==='Stanford University'?'stanford':null;
  if(key) add('connection','recommendation','把强联系转成学术证据',
    profile.connections[key]==='feedback'?'已记录目标方具体学术反馈；仍非接收或录取。':profile.connections[key]==='available'?'导师可介绍或强推，尚未记录目标方具体学术反馈。':'尚未记录本校特定联系。',
    `通过导师说明你与${record.program}的研究/训练匹配，并遵守本项目的联络流程：${text(record.supervisor)}`,
    '目标教授的积极反馈可说明匹配，但不能替代正式申请、院系评审及硕士研究名额。','to-confirm','planning',portfolio.recommenderIds);

  const conditions=[];
  const targetGpa=Math.max(profile.gpa,4.5,official?gate.minimum:0);
  if(profile.gpa<targetGpa)conditions.push(`累计GPA达到${targetGpa.toFixed(2)}/5（个人情景目标；官方成绩参考另见上项）。`);
  if(profile.coreTrend==='falling')conditions.push('近期核心课程恢复稳定或持续上升。');
  if(primaryResearch&&!researchClosed)conditions.push('主课题形成可解释的问题、关键对照、独立重复及可独立解释的主要表征证据。');
  if(primaryResearch&&!['specific','comparative'].includes(profile.recommendation))conditions.push('推荐信能够具体评价你的研究判断与独立贡献。');
  if(methodsFirst)conditions.push('以课程和可复现方法项目证明相关数学、计算及学科先修；电池实验本身不触发方法项目的软背景提档。');
  if(['action-needed','moi-review'].includes(language.status))conditions.push('按本项目正式要求补齐有效英语材料或取得适用豁免确认。');
  if(gre.status==='action-needed')conditions.push(`取得本项目要求的正式GRE并核全部分项：${greRaw}`);
  if(baselineConditional)conditions.push(`结构条件须另作书面核实，自动规则不解除：${cut(record.condition||record.prerequisites,260)}`);
  const counterfactual={...profile,gpa:Math.min(5,targetGpa),coreTrend:profile.coreTrend==='falling'?'stable':profile.coreTrend};
  if(primaryResearch)Object.assign(counterfactual,{researchStage:'mechanism',independence:'lead',reproducibility:'controlled',characterization:'independent',recommendation:'specific'});
  const potential=evaluateProgram(record,counterfactual);
  const limited=result.tier===potential.tier||baselineConditional;
  let summary=baselineConditional?(gate.status==='below'?`当前成绩低于已核${gate.minimum}/5参考；达到成绩参考后仍有结构或资格条件，规则转为「条件候选」。需落实项目资格、路线或席位条件，再按具体书面证据复核。`:'成绩达到参考或软背景增强后，结构或资格条件仍待落实，规则保留「条件候选」；先核项目资格、路线或席位，再按具体书面证据复核。')
    :result.tier===potential.tier?`补强后规则仍为「${result.tier}」。这些材料有助于竞争力，但不会承诺继续提档；顶尖项目、研究名额及院系评审仍有不确定性。`
    :`若满足下面列出的情景条件，规则建议可由「${result.tier}」调整至「${potential.tier}」。这是个人规划情景，不是录取概率或学校承诺。`;
  if(!conditions.length)conditions.push('继续保持当前已录入的课程与研究质量，按申请年度复核官方要求；没有新的自动提档承诺。');
  return {
    gaps,
    uplift:{currentTier:result.tier,potentialTier:potential.tier,summary,conditions:uniq(conditions),limited,targetGpa:Math.min(5,targetGpa),basis:'qualitative-counterfactual'},
    evidenceSummary:{...portfolio,items:undefined},
    actions:gaps.filter(g=>!['complete','not-applicable'].includes(g.status)).map(g=>({id:g.id,title:g.title,target:g.target,impact:g.impact})),
    checked:record.checked||'',
    notice:'官方要求沿用项目中标注的核对日期，未随背景输入实时联网更新；“建议补到”是个人准备目标，未标为官方的内容不是招生硬门槛。档案变化更新证据清单，档位只按背景表中已完成的证据情景计算。',
  };
}
