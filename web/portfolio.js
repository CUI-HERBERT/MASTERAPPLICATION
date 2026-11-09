/** Editable evidence records. Seed rows are merged by stable ID, never over user edits. */
export const PORTFOLIO_CATEGORIES = Object.freeze({paper:'论文',competition:'竞赛',internship:'实习',award:'奖项',recommender:'推荐人'});
const VERIFICATIONS = new Set(['document','user-confirmed','to-confirm']);
const RELEVANCE = new Set(['battery-experimental','battery-ml','materials','other']);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
const LIMITS = {title:500,organization:300,role:250,status:160,date:120,contribution:1800,evidence:1800,source:900,notes:2400};
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const clean = (value,limit) => typeof value === 'string' ? value.replace(/\u0000/g,'').slice(0,limit).trim() : '';

function sanitizeItem(value, strict=false) {
  if (!plain(value) || !Object.hasOwn(PORTFOLIO_CATEGORIES,value.category) || typeof value.id!=='string' || !ID.test(value.id) || ['constructor','prototype','__proto__'].includes(value.id)) {
    if(strict)throw new Error('经历类别或编号无效，请重新新增。');
    return null;
  }
  const item={id:value.id,category:value.category};
  for(const [key,limit] of Object.entries(LIMITS))item[key]=clean(value[key],limit);
  if(!item.title){if(strict)throw new Error('请填写名称／论文题目／推荐人。');return null;}
  item.verification=VERIFICATIONS.has(value.verification)?value.verification:'to-confirm';
  item.relevance=RELEVANCE.has(value.relevance)?value.relevance:'other';
  return item;
}

/** Missing seed rows are appended; edited rows and explicit deletions always win. */
export function normalizePortfolio(value,seed={}) {
  const input=plain(value)?value:{};
  const deletedIds=[...new Set((Array.isArray(input.deletedIds)?input.deletedIds:[]).filter(id=>typeof id==='string'&&ID.test(id)))].slice(0,1000);
  const deleted=new Set(deletedIds), seen=new Set(), items=[];
  const add=raw=>{const item=sanitizeItem(raw);if(item&&!deleted.has(item.id)&&!seen.has(item.id)&&items.length<150){items.push(item);seen.add(item.id);}};
  for(const row of (Array.isArray(input.items)?input.items:[]))add(row);
  for(const row of (Array.isArray(seed.items)?seed.items:[]))add(row);
  return {schemaVersion:1,seedVersion:Math.max(Number.isSafeInteger(input.seedVersion)?input.seedVersion:0,Number.isSafeInteger(seed.seedVersion)?seed.seedVersion:1),items,deletedIds};
}

export function createPortfolioItem(category='paper') {
  if(!Object.hasOwn(PORTFOLIO_CATEGORIES,category))category='paper';
  const suffix=globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
  return {id:`item-${suffix}`,category,...Object.fromEntries(Object.keys(LIMITS).map(k=>[k,''])),verification:'to-confirm',relevance:'other'};
}

export function upsertPortfolioItem(portfolio,value) {
  const item=sanitizeItem(value,true), next=normalizePortfolio(portfolio);
  const index=next.items.findIndex(i=>i.id===item.id);
  if(index===-1){if(next.items.length>=150)throw new Error('已达到150条经历上限，请先整理重复条目。');next.items.push(item);}else next.items[index]=item;
  next.deletedIds=next.deletedIds.filter(id=>id!==item.id);
  return next;
}

export function removePortfolioItem(portfolio,id) {
  const next=normalizePortfolio(portfolio);
  if(typeof id!=='string'||!ID.test(id))return next;
  next.items=next.items.filter(i=>i.id!==id);
  next.deletedIds=[...new Set([...next.deletedIds,id])].slice(-1000);
  return next;
}

export function summarizePortfolio(portfolio) {
  const {items}=normalizePortfolio(portfolio);
  const counts=Object.fromEntries(Object.keys(PORTFOLIO_CATEGORIES).map(k=>[k,items.filter(i=>i.category===k).length]));
  return {total:items.length,counts,toConfirm:items.filter(i=>i.verification==='to-confirm').length,
    publishedPapers:items.filter(i=>i.category==='paper'&&/^(已发表|已接收|已接受|published|accepted)(?:$|[ ·：:（(])/i.test(i.status)).length,
    activePapers:items.filter(i=>i.category==='paper'&&/在审|审稿|修改|修订|写稿|under review|revision|draft/i.test(i.status)).length};
}
