import React, { useId, useState } from 'react';
import type { TheaterLine } from '../../types';
import './FateTheater.css';
import FateTarotArt from './FateTarotArt';

export interface FateTheaterCardProps {
    activity: string;
    slotTime?: string;
    endTime?: string;
    location?: string;
    lines: TheaterLine[];
    exposed: boolean;
    factors?: { id: string; name: string; meaning: string }[];
    tendencyName?: string;
}

/** Only displays the supplied wall-clock text; never invents a time for a line. */
export function FateTheaterDetails({ activity, slotTime, endTime, location }: Pick<FateTheaterCardProps, 'activity' | 'slotTime' | 'endTime' | 'location'>) {
    return <div className="fate-theater-details">
        <p className="fate-theater-activity">{activity || '活动未记录'}</p>
        {(slotTime || endTime || location) && <p className="fate-theater-context">
            {(slotTime || endTime) && <span>{slotTime && endTime ? `${slotTime} — ${endTime}` : slotTime || `结束 ${endTime}`}</span>}
            {location && <span>{location}</span>}
        </p>}
    </div>;
}

export function FateTheaterText({ line, text = line.text }: { line: TheaterLine; text?: string }) {
    const dialogue = /[「」『』“”"]/.test(line.text || '');
    return <p className={`fate-theater-line ${dialogue ? 'fate-theater-dialogue' : 'fate-theater-scene'}`}>
        {line.emotion && <span className="fate-theater-emotion">{line.emotion}</span>}
        {text}
    </p>;
}

const FateTheaterCard: React.FC<FateTheaterCardProps> = ({
    activity, slotTime, endTime, location, lines, exposed, factors, tendencyName,
}) => {
    const [expanded, setExpanded] = useState(false);
    const contentId = useId();
    const safeLines = Array.isArray(lines) ? lines : [];
    const hasDetails = safeLines.length > 3 || !!factors?.length || !!tendencyName;
    return <article className="fate-theater-card" aria-label="命运小剧场">
        <div className="fate-theater-card-crown" aria-hidden="true"><span /><FateTarotArt factor={factors?.[0]} /><span /></div>
        <h3 className="fate-theater-card-title">命运牌阵 · 小剧场</h3>
        <FateTheaterDetails activity={activity} slotTime={slotTime} endTime={endTime} location={location} />
        {!!factors?.length && <div className="fate-theater-seals" aria-label="本轮因子">{factors.map((factor, index) => <span key={`${factor.id}:${index}`}><FateTarotArt factor={factor} /><span>{factor.name}</span></span>)}</div>}
        <p className="fate-theater-awareness">{exposed ? 'TA 已察觉你在看' : 'TA 不知情 · 不知道你看了'}</p>
        <div id={contentId}>
            {safeLines.length ? (expanded ? safeLines : safeLines.slice(0, 3)).map((line, index) =>
                <FateTheaterText key={index} line={line} />
            ) : <p className="fate-theater-empty">没有可阅读的剧场内容。</p>}
            {expanded && (tendencyName || !!factors?.length) && <section className="fate-theater-factors" aria-label="本时段命运资料">
                {tendencyName && <p>倾向 · {tendencyName}</p>}
                {factors?.map((factor, index) => <p key={`${factor.id}-${index}`}><strong>{factor.name}</strong>{factor.meaning && ` · ${factor.meaning}`}</p>)}
            </section>}
        </div>
        {hasDetails && <button type="button" className="fate-theater-button fate-theater-expand" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)}>
            {expanded ? '收起内容' : '展开全部'}
        </button>}
    </article>;
};

export default FateTheaterCard;
