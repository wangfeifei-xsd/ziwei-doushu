'use client';
import {useEffect,useRef,useState} from 'react';
import {useServices} from '@ziwei/runtime/services';
import type {ZiweiChart} from '@ziwei/domain/ziwei/types';
import type {TopicKey} from '@ziwei/domain/ziwei/db-analysis';
import type {AIMessage} from '@ziwei/domain/ai/errors';
import {analysisClock} from '@ziwei/domain/ai/analysis';
import {consumeAI} from '../ai/client';
import AiInlineText from './AiInlineText';
import {TOPIC_LABEL} from '@ziwei/domain/ziwei/dataset';

export default function DatasetDiscussion({chart,topic}:{chart:ZiweiChart;topic:TopicKey}){
 const services=useServices();const [question,setQuestion]=useState('');const [language,setLanguage]=useState('白话简体中文');
 const [history,setHistory]=useState<AIMessage[]>([]);const [answer,setAnswer]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>{request.current?.abort();},[]);
 async function send(){if(!question.trim()||request.current)return;const c=new AbortController();request.current=c;setBusy(true);setError('');setAnswer('');
  const messages:AIMessage[]=[...history,{role:'user',content:`请用${language}回答。当前资料专题：${TOPIC_LABEL[topic]}。保留关键术语、成立条件和引用。\n${question.trim()}`}];
  try{let result='';await consumeAI(services.ai.stream({kind:'interpret',body:{chart,selection:{view:'mingpan',liunianYear:analysisClock().lunarYear},messages}},c.signal),text=>{if(!c.signal.aborted){result=text;setAnswer(text);}});
   if(!c.signal.aborted){setHistory([...messages,{role:'assistant',content:result}]);setQuestion('');setAnswer('');}
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'回答失败。');}finally{if(request.current===c){request.current=null;setBusy(false);}}
 }
 return <section className="dataset-discussion"><h2>结合资料提问</h2><p className="dataset-muted">问题与当前命盘一起发送；相关样本和古籍由读取服务补充。</p>
 {history.map((m,i)=><div key={i} className="dataset-answer"><strong>{m.role==='user'?'我的问题':'学习助手'}</strong><p><AiInlineText text={m.content}/></p></div>)}
 {answer&&<p className="dataset-answer" aria-live="polite"><AiInlineText text={answer}/></p>}{error&&<p role="alert">{error}</p>}
 <form onSubmit={e=>{e.preventDefault();void send();}}><label>讲解语言<select value={language} onChange={e=>setLanguage(e.target.value)}>{['白话简体中文','繁體中文','English（保留中文星名）'].map(s=><option key={s}>{s}</option>)}</select></label>
 <label>问题<textarea rows={3} maxLength={4000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="例如：迁移宫和事业如何一起看？"/></label>
 <div className="dataset-actions"><button disabled={busy||!question.trim()}>提问</button>{busy&&<button type="button" onClick={()=>{request.current?.abort();request.current=null;setBusy(false);setAnswer('');}}>停止</button>}
 {history.length>0&&<button type="button" onClick={()=>void services.files.exportJSON('命盘学习问答.json',JSON.stringify({birth:chart.birthInfo,topic,history},null,2)).catch(e=>setError(e.message))}>导出问答</button>}</div></form>
 </section>;
}
