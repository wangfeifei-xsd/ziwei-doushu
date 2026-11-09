'use client';
import type { DatasetLoadStatus } from '@ziwei/domain/ziwei/dataset';
import DatasetStatus from './DatasetStatus';
import { useServices } from '@ziwei/runtime/services';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart, Palace } from '@ziwei/domain/ziwei/types';
import { ANALYSIS_TOPICS, type AnalysisTopic, type AnalysisView, type SelectedSiHua } from '@ziwei/domain/ai/analysis';
import { consumeAI } from '@ziwei/features/ai/client';
import AiInlineText from './AiInlineText';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  analysisScope?: string;
  status?: 'streaming' | 'complete' | 'failed' | 'stopped';
}

interface InsightPanelProps {
  chart: ZiweiChart;
  timeView: AnalysisView;
  liunianYear: number;
  selectedPalace?: Palace | null;
  selectedSiHua?: SelectedSiHua | null;
}

/** Render AI markdown: **【Title】** → gold header, **bold** → strong */
function AiContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/);
        if (sectionMatch) {
          return (
            <div key={i} className="pt-3 pb-0.5 first:pt-0">
              <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--t-gold)' }}>
                【{sectionMatch[1]}】
              </span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <div key={i} className="ai-line text-[13px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>
            {parts.map((part, j) =>
              j % 2 === 0
                ? <AiInlineText key={j} text={part} />
                : <strong key={j} className="font-medium" style={{ color: 'var(--t-text)' }}><AiInlineText text={part} /></strong>
            )}
          </div>
        );
      })}
      {streaming && (
        <span
          className="inline-block w-1.5 h-3 ml-0.5 animate-pulse rounded-sm align-middle"
          style={{ background: 'var(--t-gold)', opacity: 0.6 }}
        />
      )}
    </div>
  );
}

export default function InsightPanel({ chart, timeView, liunianYear, selectedPalace, selectedSiHua }: InsightPanelProps) {
  const services = useServices();
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), [chart]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [datasetStatus, setDatasetStatus] = useState<DatasetLoadStatus[]>([]);
  const [requestError, setRequestError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTopic, setActiveTopic] = useState<AnalysisTopic>('overview');
  const messagesRef = useRef<Message[]>([]); // always-current copy for closures
  const loadingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topicLabel = ANALYSIS_TOPICS.find(topic => topic.key === activeTopic)!.label;
  const analysisScope = [
    timeView === 'liunian' ? `${liunianYear} 年流年` : timeView === 'daxian' ? '当前大限' : '本命',
    selectedPalace?.name,
    selectedSiHua ? `${selectedSiHua.starName}化${selectedSiHua.siHua}` : undefined,
    `主题：${topicLabel}`,
  ].filter(Boolean).join(' · ');

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const streamResponse = async (apiMessages: { role: 'user' | 'assistant'; content: string }[], question: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setDatasetStatus([]); setRequestError('');
    try {
      await consumeAI(services.ai.stream({ kind: 'interpret', body: { chart, messages: apiMessages,
        selection: { view: timeView, liunianYear, topic: activeTopic, palaceBranch: selectedPalace?.branch, siHua: selectedSiHua ?? undefined },
      } }, controller.signal), text => {
        if (controller.signal.aborted) return;
        setMessages(prev => prev[prev.length - 1]?.role === 'assistant'
          ? [...prev.slice(0, -1), { role: 'assistant', content: text, status: 'streaming' }]
          : [...prev, { role: 'assistant', content: text, status: 'streaming' }]);
      }, records => { if (!controller.signal.aborted) setDatasetStatus(records); });
      if (!controller.signal.aborted) setMessages(previous => previous.map((message, index) => index === previous.length - 1 && message.role === 'assistant' ? { ...message, status: 'complete' } : message));
    } catch (e) {
      if (controller.signal.aborted) return;
      setRequestError(e instanceof Error ? e.message : '解读失败，请稍后重试。');
      setInput(current => current || question);
      setMessages(previous => previous.map((message, index) => index === previous.length - 1 && message.role === 'assistant' ? { ...message, status: 'failed' } : message));
    } finally {
      if (requestRef.current === controller) {
        setLoading(false);
        loadingRef.current = false;
      }
    }
  };

  const sendMessage = (text: string) => {
    if (!text.trim() || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const userMsg: Message = { role: 'user', content: text.trim(), analysisScope };
    // Capture current messages synchronously via ref (avoids stale closure)
    const apiMessages = [...messagesRef.current.filter(message => !['failed', 'stopped'].includes(message.status ?? '')), userMsg].map(m => ({
      role: m.role,
      content: m.analysisScope ? `【提问时的视图：${m.analysisScope}】\n${m.content}` : m.content,
    }));

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    void streamResponse(apiMessages, text.trim());
  };

  const handleSend = () => {
    sendMessage(input);
  };

  const stop = () => {
    requestRef.current?.abort(); requestRef.current = null;
    setLoading(false); loadingRef.current = false;
    setInput([...messagesRef.current].reverse().find(message => message.role === 'user')?.content ?? '');
    setMessages(previous => previous.map(message => message.status === 'streaming' ? { ...message, status: 'stopped' } : message));
    setRequestError('已停止生成，可重新提交问题。');
  };

  return (
    <div className="insight-panel flex flex-col h-full rounded-xl overflow-hidden card-glass">

      <div className="insight-heading">
        <p className="eyebrow">以盘为镜 · 以理为引</p>
        <h2>命盘解读</h2>
        <p>以GitHub开源档案为依据，结合星曜与宫位，探索人生的更多可能。</p>
        <p aria-label="当前解读范围">当前选择：{analysisScope}</p>
      </div>
      <DatasetStatus records={datasetStatus} />
      {requestError && <p role="alert" className="px-4 py-2 text-xs" style={{ color: 'var(--ji)' }}>{requestError}</p>}
      {/* ── Topic buttons ── */}
      <div className="flex-shrink-0 px-2 pt-2.5 pb-2" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div className="insight-topics grid grid-cols-3 gap-1">
          {ANALYSIS_TOPICS.map(t => {
            const isActive = activeTopic === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTopic(t.key)}
                aria-pressed={isActive}
                className="py-1.5 text-[10px] font-medium rounded-lg transition-all duration-150"
                style={{
                  background: isActive ? 'rgba(212,168,67,0.12)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(212,168,67,0.3)' : 'var(--t-border)'}`,
                  color: isActive ? 'var(--t-gold)' : 'var(--t-faint)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {messages.length === 0 && <div className="px-4">
        <div className="insight-prompts">
          {([['overview', '整体命盘格局', '了解我的星曜与人生主轴'], ['career', '事业发展方向', '探索天赋与适合的发展方向'], ['wealth', '财富与机遇', '认识财帛宫中的星曜格局'], ['love', '感情与相处', '理解关系中的缘分与成长']] as const).map(([key, title, hint]) =>
            <button key={key} type="button" aria-pressed={activeTopic === key} onClick={() => setActiveTopic(key)}><strong>{title} ↗</strong><span>{hint}</span></button>
          )}
        </div>
      </div>}
      {/* ── Messages ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

        {/* Selections become context only when a question is submitted. */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.1 }}>✦</div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>可先选择宫位、运限和主题<br />输入问题后，点击「提问」开始解读</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            if (msg.role === 'user') {
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-2 text-[11px]"
                    style={{
                      background: 'rgba(212,168,67,0.08)',
                      border: '1px solid rgba(212,168,67,0.18)',
                      color: 'var(--t-gold)',
                    }}
                  >
                    <p className="mb-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{msg.analysisScope}</p>
                    {msg.content}
                  </div>
                </motion.div>
              );
            }

            // Assistant message
            const isLastMsg = i === messages.length - 1;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div
                  className="text-[9px] tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: 'var(--t-faint)' }}
                >
                  <span style={{ color: 'var(--t-gold)', opacity: 0.4 }}>✦</span>
                  命理解读
                </div>
                <AiContent text={msg.content} streaming={loading && isLastMsg} />
                {(msg.status === 'failed' || msg.status === 'stopped') && <p className="mt-2 text-xs" style={{ color: 'var(--t-faint)' }}>回答未完成{msg.status === 'stopped' ? '（已停止生成）' : ''}。</p>}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {loading && messages[messages.length - 1]?.role === 'user' && (
          <p role="status" className="text-xs animate-pulse" style={{ color: 'var(--t-faint)' }}>正在解读…</p>
        )}
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--t-border)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入问题，如：今年适合换工作吗？"
            disabled={loading}
            aria-label="命盘解读提问" className="flex-1 rounded-lg px-3 py-2 text-[12px] focus:outline-none transition-colors"
            style={{
              background: 'var(--t-card)',
              border: '1px solid var(--t-border)',
              color: 'var(--t-text)',
            }}
          />
          <button
            type="button"
            onClick={loading ? stop : handleSend}
            disabled={!loading && !input.trim()}
            className="px-3 py-2 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(212,168,67,0.15)',
              border: '1px solid rgba(212,168,67,0.25)',
              color: 'var(--t-gold)',
            }}
          >
            {loading ? '停止生成' : '提问'}
          </button>
        </div>
      </div>

    </div>
  );
}
