import React, { useEffect, useState } from 'react';
import type { DateReplySettings, DateRuleEntry } from '../../types';
import DateExtraEditor from './DateExtraEditor';

type RuleChange = (entries: DateRuleEntry[]) => DateRuleEntry[];
const field = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-base text-slate-800';

function RuleFields({ entry, update, expandText }: { entry: DateRuleEntry; update: (patch: Partial<DateRuleEntry>) => void; expandText?: boolean }) {
    const [title, setTitle] = useState(entry.title);
    const [body, setBody] = useState(entry.body);
    const [fullEditor, setFullEditor] = useState(false);
    useEffect(() => { setTitle(entry.title); }, [entry.title]);
    useEffect(() => { setBody(entry.body); }, [entry.body]);
    return <div className="grid gap-2">
        <input aria-label="标题" placeholder="标题（可选）" className={field} value={title}
            onChange={event => setTitle(event.target.value)} onBlur={() => { if (title !== entry.title) update({ title }); }} />
        <textarea aria-label={expandText ? '规则正文' : '内容'} placeholder="输入内容" rows={3} className={field} value={body}
            onChange={event => setBody(event.target.value)} onBlur={() => { if (body !== entry.body) update({ body }); }} />
        {expandText && <button type="button" aria-label="展开编辑规则正文" className="justify-self-end text-xs text-violet-800"
            onClick={() => setFullEditor(true)}>↗ 展开</button>}
        {fullEditor && <DateExtraEditor value={body} onChange={setBody} onClose={() => {
            if (body !== entry.body) update({ body });
            setFullEditor(false);
        }} />}
    </div>;
}

export function DateRuleList({ entries = [], change, label, ordered, expandText }: {
    entries?: DateRuleEntry[]; change: (updater: RuleChange) => void; label: string; ordered?: boolean; expandText?: boolean;
}) {
    const [expanded, setExpanded] = useState('');
    const move = (id: string, direction: number) => change(previous => {
        const from = previous.findIndex(item => item.id === id);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= previous.length) return previous;
        const next = previous.slice();
        const [entry] = next.splice(from, 1);
        next.splice(to, 0, entry);
        return next;
    });
    return <div className="space-y-3">
        {entries.map((entry, index) => {
            const update = (patch: Partial<DateRuleEntry>) => change(previous => previous.map(
                item => item.id === entry.id ? { ...item, ...patch } : item));
            return <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex items-center gap-2">
                    <button type="button" className="flex-1 min-w-0 truncate text-left text-sm font-semibold" aria-expanded={expanded === entry.id}
                        onClick={() => setExpanded(expanded === entry.id ? '' : entry.id)}>
                        {ordered && `${index + 1}. `}{entry.title || entry.body.trim().split('\n')[0] || `新${label}`}
                    </button>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={entry.enabled} onChange={event => update({ enabled: event.target.checked })} />启用</label>
                </div>
                {expanded === entry.id && <>
                    <RuleFields entry={entry} update={update} expandText={expandText} />
                    <div className="flex items-center gap-3 text-xs">
                        {ordered && <>
                            <button type="button" disabled={index === 0} className="disabled:opacity-40" onClick={() => move(entry.id, -1)}>上移</button>
                            <button type="button" disabled={index + 1 === entries.length} className="disabled:opacity-40" onClick={() => move(entry.id, 1)}>下移</button>
                        </>}
                        <button type="button" className="ml-auto text-rose-700 py-1" onClick={() => change(previous => previous.filter(item => item.id !== entry.id))}>删除{label}</button>
                    </div>
                </>}
            </div>;
        })}
        <button type="button" className="w-full py-3 rounded-xl border border-dashed border-violet-300 text-violet-800 text-sm" onClick={() => {
            const id = `date-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            change(previous => [...previous, { id, title: '', body: '', enabled: true }]);
            setExpanded(id);
        }}>＋ 添加{label}</button>
    </div>;
}

const numeric = [
    { key: 'temperature', label: '温度', min: 0, max: 2, step: .05 },
    { key: 'maxTokens', label: '最大回复 Token', min: 1, max: 131072, step: 1 },
    { key: 'topP', label: 'Top P', min: 0, max: 1, step: .05 },
    { key: 'frequencyPenalty', label: '频率惩罚', min: -2, max: 2, step: .05 },
    { key: 'presencePenalty', label: '重复主题惩罚', min: -2, max: 2, step: .05 },
] as const;

export function DateReplyControls({ options = {}, change }: {
    options?: DateReplySettings; change: (update: (previous: DateReplySettings) => DateReplySettings) => void;
}) {
    const patch = (value: Partial<DateReplySettings>) => change(previous => ({ ...previous, ...value }));
    return <div className="space-y-4 text-slate-800">
        <section className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
            <label className="flex items-center justify-between text-sm font-bold">思考 <input type="checkbox" role="switch" checked={!!options.thinking} onChange={event => patch({ thinking: event.target.checked })} /></label>
            {options.thinking && <>
                <p className="text-xs text-slate-600 leading-relaxed">有思考内容返回时，角色名字外会出现一朵小云。</p>
                <label className="block space-y-1 text-sm">思考强度
                    <select className={field} value={options.effort || 'default'} onChange={event => patch({ effort: event.target.value as DateReplySettings['effort'] })}>
                        <option value="default">模型默认</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option>
                    </select>
                </label>
                <label className="block space-y-1 text-sm">思考步骤
                    <select className={field} value={options.thinkingMode || 'default'} onChange={event => patch({ thinkingMode: event.target.value as DateReplySettings['thinkingMode'] })}>
                        <option value="default">预设步骤</option><option value="custom">自定义步骤</option>
                    </select>
                </label>
                {options.thinkingMode === 'custom' && <>
                    <p className="text-xs text-slate-600">启用的步骤会按顺序使用，留空时沿用预设步骤。</p>
                    <DateRuleList entries={options.steps} ordered label="步骤"
                        change={update => change(previous => ({ ...previous, steps: update(previous.steps || []) }))} />
                </>}
            </>}
        </section>
        <section className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
            <div className="flex items-center justify-between"><h2 className="text-sm font-bold">生成参数</h2>
                <button type="button" className="text-xs text-violet-800" onClick={() => patch({
                    temperature: undefined, maxTokens: undefined, topP: undefined, frequencyPenalty: undefined, presencePenalty: undefined, stream: undefined,
                })}>恢复默认</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
                {numeric.map(item => <label key={item.key} className="space-y-1 text-xs">{item.label}
                    <input key={options[item.key] ?? 'default'} type="number" inputMode={item.key === 'maxTokens' ? 'numeric' : 'decimal'}
                        min={item.min} max={item.max} step={item.step} className={field}
                        defaultValue={options[item.key]} placeholder="默认" onBlur={event => {
                            if (event.target.validity.badInput) { event.target.value = String(options[item.key] ?? ''); return; }
                            const input = event.target.value;
                            const numericValue = Number(input);
                            const value = input === '' ? undefined : Math.min(item.max, Math.max(item.min, item.step === 1 ? Math.round(numericValue) : numericValue));
                            event.target.value = String(value ?? '');
                            if (value !== options[item.key]) patch({ [item.key]: value });
                        }} />
                </label>)}
                <label className="space-y-1 text-xs">流式回复
                    <select className={field} value={String(options.stream ?? 'default')}
                        onChange={event => patch({ stream: event.target.value === 'default' ? undefined : event.target.value === 'true' })}>
                        <option value="default">跟随接口</option><option value="true">开启</option><option value="false">关闭</option>
                    </select>
                </label>
            </div>
        </section>
    </div>;
}
