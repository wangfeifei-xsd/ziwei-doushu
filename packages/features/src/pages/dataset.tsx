'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Link,{useSearchParams,useRouter} from '@ziwei/runtime/navigation';
import {useServices} from '@ziwei/runtime/services';
import {preferences} from '@ziwei/runtime/preferences';
import {generateChart} from '@ziwei/domain/ziwei/algorithm';
import {LEARNING_CASES} from '@ziwei/domain/ziwei/learning-cases';
import {BRANCHES,SHICHEN,STAR_DESCRIPTIONS} from '@ziwei/domain/ziwei/constants';
import {DATASET_TOPICS,DATASET_VERSION,DATASET_SOURCE,datasetBirth,datasetKey,datasetPath,datasetParagraphs,recordBirth,chartFeatures,compareCharts,chartExercises,TOPIC_LABEL,type DatasetRecord,type DatasetPage as DatasetSearchPage,type DatasetStatus} from '@ziwei/domain/ziwei/dataset';
import type {TopicKey} from '@ziwei/domain/ziwei/db-analysis';
import type {ZiweiChart} from '@ziwei/domain/ziwei/types';
import ChartBoard from '@ziwei/ui/components/ChartBoard';
import DatasetDiscussion from '../components/DatasetDiscussion';
import DatasetKnowledge from '../components/DatasetKnowledge';

const TABS=['专题阅读','找盘与检索','对照学习','练习与课程','知识与古籍','资料检查','研究工具'] as const;
const FIRST=datasetKey(LEARNING_CASES[0].birth);
function safeKey(key:string|null){try{return datasetKey(datasetBirth(key||FIRST));}catch{return FIRST;}}
function featureSummary(chart:ZiweiChart){const f=chartFeatures(chart);return `命宫在${BRANCHES[f.branch]} · ${f.majors.join('、')||'命宫空宫'} · 身宫在${f.bodyPalace}`;}

function Exercises({chart,onOpen}:{chart:ZiweiChart;onOpen:(key:string)=>void}){
 const key=datasetKey(chart.birthInfo);const exercises=chartExercises(chart);const [revealed,setRevealed]=useState<string[]>([]);const [progress,setProgress]=useState<Record<string,string[]>>({});
 useEffect(()=>{try{setProgress(JSON.parse(preferences.getItem('ziwei-learning-progress-v1')||'{}'));}catch{setProgress({});}},[]);
 const save=(id:string,mastered:boolean)=>{const next={...progress,[key]:mastered?[...new Set([...(progress[key]||[]),id])]:(progress[key]||[]).filter(s=>s!==id)};setProgress(next);preferences.setItem('ziwei-learning-progress-v1',JSON.stringify(next));};
 const next=LEARNING_CASES.find(l=>(progress[datasetKey(l.birth)]||[]).length<exercises.length)||LEARNING_CASES[0];
 return <><h2>先看盘，再核对</h2><p>答案由当前排盘引擎生成。掌握程度由你自己标记，用于安排复习。</p>
 {exercises.map(e=><article className="dataset-exercise" key={e.id}><h3>{e.question}</h3><button onClick={()=>setRevealed(p=>[...p,e.id])}>核对答案</button>{revealed.includes(e.id)&&<><p>{e.answer}</p><p className="dataset-muted">{e.explanation}</p><div className="dataset-actions"><button aria-pressed={progress[key]?.includes(e.id)||false} onClick={()=>save(e.id,true)}>已掌握</button><button onClick={()=>save(e.id,false)}>需要复习</button></div></>}</article>)}
 <h2>学习路径</h2><p>入门：主星与命身宫 → 进阶：借星与三方 → 条件辨析：四化、格局与运限。</p>
 <p>建议下一课：<button onClick={()=>onOpen(datasetKey(next.birth))}>{next.title}</button></p>
 <div className="dataset-lessons">{LEARNING_CASES.map(l=><button key={l.id} onClick={()=>onOpen(datasetKey(l.birth))}><strong>{l.title}</strong><span>{l.topic} · 已掌握 {(progress[datasetKey(l.birth)]||[]).length}/4</span></button>)}</div></>;
}

function SearchCases({current,onOpen}:{current:ZiweiChart;onOpen:(key:string)=>void}){
 const services=useServices();const [year,setYear]=useState(1990);const [text,setText]=useState('');const [star,setStar]=useState('');const [topic,setTopic]=useState<TopicKey>('overview');const [pattern,setPattern]=useState('');const [empty,setEmpty]=useState(false);
 const [page,setPage]=useState<DatasetSearchPage|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{request.current?.abort();request.current=null;setBusy(false);setPage(null);},[year,text,star,topic]);
 async function search(offset=0){request.current?.abort();const c=new AbortController();request.current=c;setBusy(true);setError('');setPage(null);try{if(!services.dataset)throw new Error('当前预览未连接资料读取服务。');const p=await services.dataset.search({year,offset,limit:24,text,primaryStar:star,topic},c.signal);if(!c.signal.aborted)setPage(p);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'查询失败。');}finally{if(request.current===c){setBusy(false);request.current=null;}}}
 const candidates=useMemo(()=>page?.items.map(r=>{const chart=generateChart(recordBirth(r));return {r,chart,features:chartFeatures(chart),comparison:compareCharts(current,chart)};})||[],[page,current]);
 const shown=candidates.filter(c=>(!empty||c.features.empty)&&(!pattern||c.features.patterns.some(p=>p.includes(pattern)))).sort((a,b)=>b.comparison.similarity-a.comparison.similarity);
 return <><h2>从压缩资料中找例盘</h2><p>先查询一个年份的专题文字和旧版主星索引，再用当前引擎核对候选盘。每次最多扫描 512 条；可以继续下一批。</p>
 <form onSubmit={e=>{e.preventDefault();void search();}}><div className="dataset-fields"><label>年份<input type="number" min={1950} max={2026} value={year} onChange={e=>setYear(Number(e.target.value))}/></label><label>专题<select value={topic} onChange={e=>setTopic(e.target.value as TopicKey)}>{DATASET_TOPICS.map(t=><option key={t} value={t}>{TOPIC_LABEL[t]}</option>)}</select></label><label>命宫首颗主星（旧索引）<select value={star} onChange={e=>setStar(e.target.value)}><option value="">全部</option>{['空宫',...Object.keys(STAR_DESCRIPTIONS)].map(s=><option key={s}>{s}</option>)}</select></label><label>专题关键词<input maxLength={80} value={text} onChange={e=>setText(e.target.value)} placeholder="例如：迁移"/></label></div><button disabled={busy}>{busy?'正在扫描…':'检索资料'}</button>{busy&&<button type="button" onClick={()=>{request.current?.abort();request.current=null;setBusy(false);}}>取消</button>}</form>
 <div className="dataset-fields"><label>当前候选的格局包含<input value={pattern} onChange={e=>setPattern(e.target.value)} placeholder="例如：杀破狼"/></label><label className="dataset-check"><input type="checkbox" checked={empty} onChange={e=>setEmpty(e.target.checked)}/>候选盘只看命宫空宫</label></div>
 {error&&<p role="alert">{error}</p>}{page&&<><p role="status">本批扫描 {page.scanned} 条，文字条件命中 {page.items.length} 条，当前结构筛选显示 {shown.length} 条。相似度仅比较当前盘的星曜、宫位、四化与亮度。</p>
 {shown.map(({r,chart,features,comparison})=><details key={r.k}><summary>{r.k} · 结构相似度 {comparison.similarity}%</summary><p>{featureSummary(chart)}</p><p>当前格局：{features.patterns.join('、')||'无已识别格局'}</p><p>{datasetParagraphs(r,topic).find(p=>!p.flags.length)?.text}</p><button onClick={()=>onOpen(r.k)}>打开此盘</button></details>)}
 {page.nextOffset!==null&&<button disabled={busy} onClick={()=>void search(page.nextOffset!)}>继续下一批</button>}</>}
 <p className="dataset-muted">当前页筛选不是全库统计。全量结构索引和覆盖统计可使用“研究工具”的流式处理命令生成。</p></>;
}

function Compare({chart,topic}:{chart:ZiweiChart;topic:TopicKey}){
 const services=useServices();const [key,setKey]=useState(datasetKey({...chart.birthInfo,hour:(chart.birthInfo.hour+1)%12}));const [other,setOther]=useState<DatasetRecord|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 async function read(k=key){request.current?.abort();const c=new AbortController();request.current=c;setError('');setBusy(true);setOther(null);try{datasetBirth(k);if(!services.dataset)throw new Error('资料服务不可用。');const r=await services.dataset.read(k,c.signal);if(!c.signal.aborted)setOther(r);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'读取失败。');}finally{if(request.current===c){request.current=null;setBusy(false);}}}
 const comparison=useMemo(()=>other?compareCharts(chart,generateChart(recordBirth(other))):null,[chart,other]);
 const variants=useMemo(()=>Array.from({length:12},(_,hour)=>generateChart({...chart.birthInfo,hour})),[chart]);
 return <><h2>固定日期，比较十二时辰</h2><p>结构差异由当前引擎计算；选中候选后读取其专题资料。这些比较不证明真实出生时辰。</p><div className="dataset-lessons">{variants.map(c=><button key={c.birthInfo.hour} onClick={()=>{const k=datasetKey(c.birthInfo);setKey(k);void read(k);}}><strong>{SHICHEN[c.birthInfo.hour].name}</strong><span>{featureSummary(c)}</span></button>)}</div>
 <form onSubmit={e=>{e.preventDefault();void read();}}><label>对照盘生辰键<input value={key} onChange={e=>setKey(e.target.value)}/></label><div className="dataset-actions"><button disabled={busy}>读取对照盘</button><button type="button" onClick={()=>{const k=datasetKey({...chart.birthInfo,gender:chart.birthInfo.gender==='male'?'female':'male'});setKey(k);void read(k);}}>同生辰切换性别</button></div></form>
 {error&&<p role="alert">{error}</p>}{comparison&&other&&<><h3>结构差异 · 相似度 {comparison.similarity}%</h3><p>甲方：{comparison.a.key}；乙方：{comparison.b.key}</p><details><summary>甲方独有 {comparison.onlyA.length} 项</summary><p>{comparison.onlyA.join('；')}</p></details><details><summary>乙方独有 {comparison.onlyB.length} 项</summary><p>{comparison.onlyB.join('；')}</p></details><details><summary>乙方的{TOPIC_LABEL[topic]}参考</summary>{datasetParagraphs(other,topic).filter(p=>!p.flags.length).slice(0,4).map(p=><p key={p.id}>{p.text}</p>)}</details><p>双方背景只供对照，不构成关系匹配分数。<Link href="/heming">进入双人合盘</Link>，提问时会分别检索双方资料。</p></>}
 </>;
}

function Session({record,topic,onTopic,onOpen}:{record:DatasetRecord;topic:TopicKey;onTopic:(t:TopicKey)=>void;onOpen:(key:string)=>void}){
 const services=useServices();const chart=useMemo(()=>generateChart(recordBirth(record)),[record]);const [tab,setTab]=useState<typeof TABS[number]>('专题阅读');const [snapshot,setSnapshot]=useState(false);const [note,setNote]=useState('');const [message,setMessage]=useState('');const [star,setStar]=useState(record.ms||'紫微');const [status,setStatus]=useState<DatasetStatus|null>(null);
 useEffect(()=>{setNote(preferences.getItem(`ziwei-study-note:${record.k}`)||'');},[record.k]);
 useEffect(()=>{if(tab==='资料检查')void services.dataset?.status().then(setStatus).catch(e=>setMessage(e.message));},[tab,services]);
 const paragraphs=datasetParagraphs(record,topic);const shown=paragraphs.filter(p=>snapshot||!p.flags.length);const f=chartFeatures(chart);
 async function exportNotes(){try{await services.files.exportJSON(`命盘笔记-${record.k}.json`,JSON.stringify({version:1,source:DATASET_SOURCE,contentVersion:DATASET_VERSION,birth:recordBirth(record),chart,topic,note,paragraphs:paragraphs.filter(p=>!p.flags.length),attribution:'王多鱼AI / Renhuai123/ziwei-doushu · CC BY 4.0；已排除独立许可引文及时间/亮度快照段落'},null,2));setMessage('阅读笔记已导出。');}catch(e){setMessage(e instanceof Error?e.message:'导出失败。');}}
 return <><p className="dataset-current">{record.k} · {featureSummary(chart)}</p><details><summary>查看当前完整命盘</summary><ChartBoard chart={chart}/></details>
 <nav className="dataset-tabs" aria-label="资料功能">{TABS.map(t=><button key={t} aria-pressed={t===tab} onClick={()=>{setTab(t);setMessage('');}}>{t}</button>)}</nav>
 <label className="dataset-topic">资料专题<select value={topic} onChange={e=>onTopic(e.target.value as TopicKey)}>{DATASET_TOPICS.map(t=><option key={t} value={t}>{TOPIC_LABEL[t]}</option>)}</select></label>
 {message&&<p role="status">{message}</p>}
 {tab==='专题阅读'&&<><h2>{TOPIC_LABEL[topic]}</h2><p className="dataset-muted">资料版本 2026-10-15。正文是旧版生成的学习参考，以当前命盘与所选运限为准。</p><label className="dataset-check"><input type="checkbox" checked={snapshot} onChange={e=>setSnapshot(e.target.checked)}/>显示含时间、亮度或独立许可引文的原始快照段落</label><p className="dataset-muted">当前显示 {shown.length} / {paragraphs.length} 段。问答会从过滤后的段落中按相关性再选取。</p>
 <div className="dataset-reading">{shown.map(p=><article key={p.id} id={`p-${topic}-${p.index}`}><div className="dataset-source">段落 {p.index+1}{p.flags.length>0&&` · ${p.flags.join(' / ')} · 不自动用于问答`}<Link href={p.path}>引用定位</Link></div><p>{p.text}</p></article>)}</div>
 <label>我的学习笔记<textarea rows={4} maxLength={12000} value={note} onChange={e=>setNote(e.target.value)}/></label><div className="dataset-actions"><button onClick={()=>{preferences.setItem(`ziwei-study-note:${record.k}`,note);setMessage('笔记已保存在本机。');}}>保存笔记</button><button onClick={()=>void exportNotes()}>导出阅读笔记</button></div>
 <DatasetDiscussion key={record.k} chart={chart} topic={topic}/></>}
 {tab==='找盘与检索'&&<SearchCases current={chart} onOpen={onOpen}/>}
 {tab==='对照学习'&&<Compare chart={chart} topic={topic}/>}
 {tab==='练习与课程'&&<Exercises chart={chart} onOpen={onOpen}/>}
 {tab==='知识与古籍'&&<><label>星曜<select value={star} onChange={e=>setStar(e.target.value)}>{Object.keys(STAR_DESCRIPTIONS).map(s=><option key={s}>{s}</option>)}</select></label><DatasetKnowledge star={star} topic={topic}/></>}
 {tab==='资料检查'&&<><h2>当前盘与旧资料的对照</h2><p>资料命宫首颗主星：{record.ms||'空宫'}；当前命宫：{f.majors.join('、')||'空宫'}。</p><p>当前亮度：{chart.palaces.find(p=>p.branch===chart.mingGongBranch)?.stars.filter(s=>s.type==='major').map(s=>`${s.name}（${s.brightnessRaw||'未标注'}）`).join('、')}</p><p>旧资料总论：{record.c.overview.split('\n').find(l=>l.includes('本宫主星'))}</p><p>当前格局：{f.patterns.join('、')||'无已识别格局'}</p><p>本专题时间段落 {paragraphs.filter(p=>p.flags.includes('时间快照')).length}；旧版亮度段落 {paragraphs.filter(p=>p.flags.includes('旧版亮度')).length}；独立许可引文段落 {paragraphs.filter(p=>p.flags.includes('独立许可引文')).length}。</p><p>过滤按文字特征保守处理，不能替代人工校勘。年度和配置差异须按当前引擎核对。</p>{status&&<><p>{status.years} 年 / {status.records.toLocaleString()} 条 / {(status.compressedBytes/1e6).toFixed(2)} MB 压缩资料；{status.mode}。</p><p>内存缓存 {status.cachedRecords}/{status.cacheLimit} 条。</p><button onClick={()=>void services.dataset?.clearCache().then(()=>services.dataset!.status()).then(setStatus).catch(e=>setMessage(e.message))}>清空读取缓存</button></>}</>}
 {tab==='研究工具'&&<><h2>可复现的资料处理</h2><p>下列工具随源码提供，均从年份压缩文件流式读取。操作在项目终端执行，输出到本机 .runtime/dataset，不修改原始资料。</p>
 {[
 ['完整性校验','npm run dataset:verify','核对 77 个年份压缩文件的字节数与 SHA-256；构建安装包前自动执行。'],
 ['结构索引与覆盖统计','npm run dataset:tools -- index --year 1990','逐条重排当前命盘，生成结构标签和格局计数；可指定 --from/--to 批量处理。'],
 ['段落去重与全文检索库','npm run dataset:tools -- dedupe --year 1990','生成 SQLite 去重段落、出生键/专题引用与全文索引；保留版本和段落顺序。'],
 ['独立压缩记录与随机读取索引','npm run dataset:tools -- pack --year 1990','生成按记录压缩的数据文件与偏移索引，用于对比随机查找成本。'],
 ['清洗后的训练候选与分组拆分','npm run dataset:tools -- training --year 1990 --limit 200','输出去重的候选样本；排除引文和时间/亮度快照，以精确内容哈希分组拆分；仅作为待人工审核的研究材料。'],
 ['问答检索与引用评测','npm run dataset:tools -- evaluate','检查十盘匹配、引用预算、时间/亮度过滤和人物隔离，生成机器可读报告。'],
 ].map(([title,command,description])=><details key={title}><summary>{title}</summary><code>{command}</code><p>{description}</p></details>)}
 <p>训练候选不会自动提交给模型服务，也不代表完成了模型训练或实证预测评测。结构频率描述枚举生辰，不代表现实人口分布。</p></>}
 </>;
}

export default function DatasetPage(){
 const services=useServices(),params=useSearchParams(),router=useRouter();const key=safeKey(params.get('key'));const rawTopic=params.get('topic');
 const [topic,setTopic]=useState<TopicKey>(DATASET_TOPICS.includes(rawTopic as TopicKey)?rawTopic as TopicKey:'overview');
 const [input,setInput]=useState(key);const [record,setRecord]=useState<DatasetRecord|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{if(DATASET_TOPICS.includes(rawTopic as TopicKey))setTopic(rawTopic as TopicKey);},[rawTopic]);
 useEffect(()=>{const c=new AbortController();setInput(key);setRecord(null);setError('');setLoading(true);
  if(!services.dataset){setError('当前样式预览未连接资料服务；请打开 Web 应用或原生安装包。');setLoading(false);return;}
  services.dataset.read(key,c.signal).then(r=>{if(!c.signal.aborted){setRecord(r);if(!r)setError('没有找到这个生辰的资料。');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
 },[key,services]);
 const open=(k:string)=>{try{datasetBirth(k);router.push(datasetPath(k,topic));}catch(e){setError(e instanceof Error?e.message:'生辰键无效。');}};
 return <main className="dataset-page"><header><p className="eyebrow">以盘为课 · 有据可查</p><h1>命盘资料研习</h1><p>查阅十三专题资料，比较命盘、练习看盘，并保存自己的学习记录。</p></header>
 <div className="dataset-fields"><label>教学例盘<select value={LEARNING_CASES.find(l=>datasetKey(l.birth)===key)?.id||''} onChange={e=>{const lesson=LEARNING_CASES.find(l=>l.id===e.target.value);if(lesson)open(datasetKey(lesson.birth));}}><option value="">自选生辰</option>{LEARNING_CASES.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select></label>
 <form onSubmit={e=>{e.preventDefault();open(input);}}><label>公历日期－时辰序号－性别<input value={input} onChange={e=>setInput(e.target.value)} aria-label="资料生辰键" placeholder="1990-02-06-11-male"/></label><button>读取资料</button></form></div>
 <p className="dataset-muted">覆盖 1950–2026 年。时辰为 0–11（子时为 0）；日期须是完成真太阳时与换日处理后的排盘日。</p>
 {loading&&<p role="status">正在读取并流式解压所需年份…</p>}{error&&<p role="alert">{error}</p>}{record&&<Session key={record.k} record={record} topic={topic} onTopic={setTopic} onOpen={open}/>}
 <footer className="dataset-footer"><Link href={DATASET_SOURCE}>数据来源：王多鱼AI / ziwei-doushu v4.0</Link><p>内容版本 {DATASET_VERSION} · CC BY 4.0，内嵌《天纪》引文另行适用仓库列明的许可。资料为批量生成的传统文化学习参考，无真实人物经历标签。</p></footer></main>;
}
