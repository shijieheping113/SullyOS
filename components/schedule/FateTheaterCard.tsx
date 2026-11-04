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
    const hasDetails = safeLines.length > 0 || !!factors?.length || !!tendencyName;
    return <article className={`fate-theater-card${expanded ? ' fate-theater-card--expanded' : ''}`} aria-label="命运小剧场">
        <div className="fate-theater-card-heading"><FateTarotArt factor={factors?.[0]} /><h3 className="fate-theater-card-title">命运小剧场</h3><span className="fate-theater-awareness">{exposed ? '已察觉' : '不知情'}</span></div>
        <FateTheaterDetails activity={activity} slotTime={slotTime} endTime={endTime} location={location} />
        <div id={contentId} className={expanded ? 'fate-theater-card-reading' : 'fate-theater-card-preview'} tabIndex={expanded ? 0 : undefined}>
            {expanded ? safeLines.map((line, index) =>
                <FateTheaterText key={index} line={line} />
            ) : safeLines.length ? <p className="fate-theater-excerpt">{safeLines[0].text}</p> : <p className="fate-theater-empty">没有可阅读的剧场内容。</p>}
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
