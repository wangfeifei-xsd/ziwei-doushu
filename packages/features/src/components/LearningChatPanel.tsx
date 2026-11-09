'use client';
import type { DatasetLoadStatus } from '@ziwei/domain/ziwei/dataset';
import DatasetStatus from './DatasetStatus';
import { useEffect, useRef, useState } from 'react';
import Link from '@ziwei/runtime/navigation';
import { useServices } from '@ziwei/runtime/services';
import type { AIMessage } from '@ziwei/domain/ai/errors';
import type { AnalysisSelection } from '@ziwei/domain/ai/analysis';
import type { LearningCase } from '@ziwei/domain/ziwei/learning-cases';
import type { ZiweiChart } from '@ziwei/domain/ziwei/types';
import { consumeAI } from '../ai/client';
import AiInlineText from './AiInlineText';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  scope?: string;
  status?: 'streaming' | 'complete' | 'stopped' | 'failed';
}

function Answer({ text }: { text: string }) {
  return <div className="learn-answer">{text.split('\n').map((line, index) => {
    const heading = line.match(/^(?:\*\*【(.+?)】\*\*|#{1,4}\s+(.+))$/);
    if (heading) return <h3 key={index}>{heading[1] || heading[2]}</h3>;
    if (!line.trim()) return <div key={index} className="learn-answer-space" />;
    return <p key={index}>{line.split(/\*\*(.+?)\*\*/).map((part, i) => i % 2
      ? <strong key={i}><AiInlineText text={part} /></strong>
      : <AiInlineText key={i} text={part} />)}</p>;
  })}</div>;
}

export default function LearningChatPanel({ lesson, chart, selection }: {
  lesson: LearningCase; chart: ZiweiChart; selection: AnalysisSelection;
}) {
  const services = useServices();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [datasetStatus, setDatasetStatus] = useState<DatasetLoadStatus[]>([]);
  const [retryQuestion, setRetryQuestion] = useState('');
  const history = useRef<AIMessage[]>([]);
  const requestRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const followStream = useRef(true);
  const palace = chart.palaces.find(item => item.branch === selection.palaceBranch);
  const scope = `${selection.view === 'liunian' ? `${selection.liunianYear} 年流年` : selection.view === 'daxian' ? '当前大限' : '本命'}${palace ? ` · ${palace.name}` : ''}${selection.siHua ? ` · ${selection.siHua.starName}化${selection.siHua.siHua}` : ''}`;

  useEffect(() => () => { requestRef.current?.abort(); }, []);
  useEffect(() => {
    if (messages.length && scrollRef.current && followStream.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true); setError(''); setDatasetStatus([]); setRetryQuestion(text); setInput('');
    followStream.current = true;
    const apiMessages: AIMessage[] = [...history.current, {
      role: 'user' as const, content: `【提问时的视图：${scope}】\n${text}`,
    }];
    setMessages(previous => [...previous, { role: 'user', content: text, scope }, { role: 'assistant', content: '', status: 'streaming' }]);
    let answer = '';
    const updateAnswer = (status: Message['status']) => setMessages(previous => [
      ...previous.slice(0, -1), { role: 'assistant', content: answer, status },
    ]);
    try {
      await consumeAI(services.ai.stream({ kind: 'interpret', body: {
        chart, learningCaseId: lesson.id, selection, messages: apiMessages,
      } }, controller.signal), text => {
        if (controller.signal.aborted || requestRef.current !== controller) return;
        answer = text; updateAnswer('streaming');
      }, records => { if (!controller.signal.aborted && requestRef.current === controller) setDatasetStatus(records); });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      history.current = [...apiMessages, { role: 'assistant', content: answer }];
      updateAnswer('complete');
    } catch (failure) {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      updateAnswer('failed');
      setInput(current => current || text);
      setError(failure instanceof Error ? failure.message : '暂时无法回答，请稍后重试。');
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setLoading(false); }
    }
  };

  const stop = () => {
    requestRef.current?.abort(); requestRef.current = null; setLoading(false);
    setMessages(previous => previous.map((message, index) => index === previous.length - 1
      ? { ...message, status: 'stopped' } : message));
  };

  return <section className={`learn-chat${messages.length === 0 ? ' learn-chat-idle' : ''}`} aria-label="命盘学习问答">
    <header className="learn-chat-heading">
      <p className="eyebrow">问盘 · 学理</p>
      <h2>一起读懂这张盘</h2>
      <p>从盘面事实出发，把每一步看盘思路讲清楚。</p>
      <div className="learn-scope" aria-label="学习提问范围"><span />{lesson.title} · {scope}</div>
    </header>
    <DatasetStatus records={datasetStatus} />
    {messages.length === 0 ? <details className="learn-recommendations">
      <summary>推荐学习问题<span className="learn-expand-label">展开</span><span className="learn-collapse-label">收起</span></summary>
      <div className="learn-empty">
        <h3>从一个好问题开始</h3>
        <p>先观察左侧命盘，也可以点选宫位，<br />再问一问它与其他星曜的关系。</p>
        <div className="learn-suggestions" aria-label="推荐学习问题">
          {lesson.questions.map((question, index) => <button key={question} type="button" onClick={() => {
            setInput(question); inputRef.current?.focus();
          }}><span>0{index + 1}</span>{question}<span aria-hidden="true">↗</span></button>)}
        </div>
      </div>
    </details> : <div className="learn-messages" ref={scrollRef} role="log" aria-label="学习对话" aria-live="polite" aria-busy={loading}
      onScroll={() => { const el = scrollRef.current; if (el) followStream.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64; }}>
      {messages.map((message, index) => <article key={index} className={`learn-message learn-message-${message.role}`}>
        <div className="learn-message-label">{message.role === 'user' ? '我的问题' : '学习助手'}{message.scope && <span>{message.scope}</span>}</div>
        {message.role === 'user' ? <p className="learn-question-text">{message.content}</p> : <>
          {message.content ? <Answer text={message.content} /> : message.status === 'streaming' && <p className="learn-thinking">正在结合命盘与资料梳理…</p>}
          {message.status === 'streaming' && <span className="learn-stream-caret" aria-hidden="true" />}
          {message.status === 'stopped' && <p className="learn-message-note">已停止生成，这段未完成的回答不会带入后续提问。</p>}
          {message.status === 'failed' && <p className="learn-message-note">本次回答未完成。</p>}
        </>}
      </article>)}
    </div>}
    <details className="learn-context">
      <summary>提问时会参考哪些资料？</summary>
      <p>当前模拟生辰、十二宫星曜与亮度、命身宫、生年四化、三方四正与借星、格局条件、全部大限，以及所选流年和宫位。</p>
      <p>同时参考本例学习要点、星曜基础、按问题检索的文献条目、同生辰本地档案全部 13 个专题原文，以及本盘已完成的全部对话。原文完整保留，旧版时间与亮度描述由模型结合当前盘面核对；资料读取失败时会明确显示，本次使用当前命盘与古籍。切换示例会开启新对话。</p>
    </details>
    {error && <div className="learn-error" role="alert"><p>{error}</p><div>
      <button type="button" disabled={loading} onClick={() => void send(retryQuestion)}>重试本题</button>
      <Link href="/settings/model">模型配置</Link>
    </div></div>}
    <form className="learn-composer" onSubmit={event => { event.preventDefault(); void send(input); }}>
      <label htmlFor="learning-question">关于这张盘，你想了解什么？</label>
      <textarea id="learning-question" ref={inputRef} value={input} rows={3} disabled={loading}
        placeholder={`例如：这张盘的${lesson.title}应该怎样理解？`} onChange={event => setInput(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input); } }} />
      <div className="learn-composer-actions"><span>Ctrl / ⌘ + Enter</span>
        {loading ? <button type="button" className="learn-stop" onClick={stop}>停止生成</button>
          : <button type="submit" className="button-gold" disabled={!input.trim()}>发送问题 <span aria-hidden="true">↑</span></button>}
      </div>
    </form>
    <p className="learn-chat-footnote">传统文化学习参考 · 回答由你配置的模型生成</p>
  </section>;
}
