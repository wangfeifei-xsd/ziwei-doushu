'use client';
import {useEffect,useState} from 'react';
import Link from '@ziwei/runtime/navigation';
import {useServices} from '@ziwei/runtime/services';
import {STAR_DESCRIPTIONS} from '@ziwei/domain/ziwei/constants';
import {datasetParagraphs,TOPIC_LABEL,DATASET_SOURCE,type DatasetRecord} from '@ziwei/domain/ziwei/dataset';
import type {TopicKey} from '@ziwei/domain/ziwei/db-analysis';
import {searchClassics,getParagraphById} from '@ziwei/content/classics';
export default function DatasetKnowledge({star,topic}:{star:string;topic:TopicKey}){
 const services=useServices();const [records,setRecords]=useState<DatasetRecord[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(false);
 useEffect(()=>{const c=new AbortController();setRecords([]);setError('');if(!services.dataset)return;setLoading(true);services.dataset.search({year:1990,primaryStar:star,topic,limit:3},c.signal).then(p=>{if(!c.signal.aborted)setRecords(p.items);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[services,star,topic]);
 const hits=searchClassics(star,4);
 return <section className="knowledge-detail"><h1>{star} · {TOPIC_LABEL[topic]}</h1><p>{STAR_DESCRIPTIONS[star]?.keywords} · {STAR_DESCRIPTIONS[star]?.nature} · {STAR_DESCRIPTIONS[star]?.element}</p><p className="knowledge-detail-note">基础星义结合具体例盘阅读。以下是旧版生成资料中的案例，不将个别命盘解释推广为通则。</p>
 <h2>例盘资料</h2>{loading&&<p role="status">正在读取压缩资料…</p>}{error&&<p role="alert">{error}</p>}
 {records.map(r=><details key={r.k}><summary>{r.k} · {TOPIC_LABEL[topic]}</summary>{datasetParagraphs(r,topic).filter(p=>!p.flags.length).slice(0,3).map(p=><p key={p.id}>{p.text}</p>)}</details>)}
 <h2>可核验的古籍条目</h2>{hits.map(h=>{const found=getParagraphById(h.paragraphId);return <p key={h.paragraphId}>{found&&<Link href={`/library/${h.bookSlug}/${found.chapterIdx}#${h.paragraphId}`}>{h.bookTitle} · {h.chapterTitle}</Link>}<br/>{h.text}</p>;})}
 <p className="knowledge-detail-note"><Link href={DATASET_SOURCE}>资料来源：王多鱼AI / ziwei-doushu v4.0</Link> · CC BY 4.0</p></section>;
}
