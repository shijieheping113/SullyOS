import React, { useEffect, useRef, useState } from 'react';
import type { APIConfig, ApiPreset, CharacterProfile, DailySchedule, ScheduleSlot } from '../../types';
import FateSchedulePanel from './FateSchedulePanel';
import FateLibraryView from './FateLibraryView';
import FateEmotionView from './FateEmotionView';
import './FateScheduleSuite.css';

export interface FateScheduleSuiteProps {
    character: CharacterProfile;
    schedule: DailySchedule | null;
    enabled: boolean;
    onToggle?: () => void;
    onChange: (patch: Partial<CharacterProfile>) => void;
    onEdit?: (index: number, slot: ScheduleSlot) => void | Promise<void>;
    onDelete?: (index: number) => void | Promise<void>;
    onReroll?: () => void;
    onPlayTheater?: (index: number) => void;
    isGenerating?: boolean;
    isViewing?: boolean;
    apiPresets: ApiPreset[];
    onSaveEmotion: (config: NonNullable<CharacterProfile['emotionConfig']>) => void;
    onClearBuffs: () => void;
    onAddApiPreset?: (name: string, config: APIConfig) => void;
}

const FateScheduleSuite: React.FC<FateScheduleSuiteProps> = props => {
    const [tab, setTab] = useState<'schedule' | 'library' | 'emotion'>('schedule');
    const containerRef = useRef<HTMLDivElement>(null);
    const busy = !!(props.isGenerating || props.isViewing);
    useEffect(() => setTab('schedule'), [props.character.id]);
    useEffect(() => {
        const region = containerRef.current?.closest('.fate-dialog__body');
        if (region) region.scrollTop = 0;
    }, [tab]);
    return <div className="fate-suite" ref={containerRef}>
        <nav className="fate-suite__tabs" aria-label="命运牌阵页面">
            {([{ id: 'schedule', name: '日程' }, { id: 'library', name: '牌库' }, { id: 'emotion', name: '情绪' }] as const).map(item =>
                <button type="button" key={item.id} aria-pressed={tab === item.id} aria-controls={`fate-suite-${item.id}`} onClick={() => setTab(item.id)}>{item.name}</button>)}
        </nav>
        {tab === 'schedule' && <section id="fate-suite-schedule" aria-label="命运日程">
            {props.enabled ? <FateSchedulePanel embedded character={props.character} schedule={props.schedule?.mode === 'fate' ? props.schedule : null} onToggle={props.onToggle} onEdit={props.onEdit} onDelete={props.onDelete} onReroll={props.onReroll} onPlayTheater={props.onPlayTheater} isGenerating={props.isGenerating} isViewing={props.isViewing} />
                : <div className="fate-suite__rest"><h2>毛线球先睡一会儿</h2><p>日程已关闭，情绪照自己的开关走。</p><button type="button" disabled={!props.onToggle || busy} onClick={props.onToggle}>牵起生活线</button></div>}
        </section>}
        {tab === 'library' && <section id="fate-suite-library" aria-label="命运牌库"><FateLibraryView char={props.character} onChange={props.onChange} isBusy={busy} /></section>}
        {tab === 'emotion' && <section id="fate-suite-emotion" aria-label="角色情绪"><FateEmotionView char={props.character} apiPresets={props.apiPresets} onSave={props.onSaveEmotion} onClearBuffs={props.onClearBuffs} onAddApiPreset={props.onAddApiPreset} isBusy={busy} /></section>}
    </div>;
};
export default FateScheduleSuite;
