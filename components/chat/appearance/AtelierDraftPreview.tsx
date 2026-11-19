import React from 'react';
import BeautyPresetPreview from '../../share/BeautyPresetPreview';
import type {DecorationPreset} from '../../../utils/chatDecoration';

export default function AtelierDraftPreview({preset, motion, onBack}: {preset: DecorationPreset; motion?: boolean; onBack: () => void}) {
    return <section className="atelier-manual-preview" aria-label="装扮预览">
        <header><button type="button" onClick={onBack}>‹ 返回编辑</button><strong>装扮预览</strong></header>
        {motion && <p>点重播，再上下滑动示例消息查看动画。</p>}
        <div className="atelier-manual-preview-body"><BeautyPresetPreview data={preset} sceneScope={motion?'motion':'all'} editing fitPhone/></div>
    </section>;
}
