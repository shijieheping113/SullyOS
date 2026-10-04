/** 修格式预览：语音源码里的语气记号，聊天语音条不会原样显示。翻译块会落成双语气泡，不走这里。 */
export function repairPreviewNeedsRawSource(source: string): boolean {
    const s = (source || '').trim();
    if (!s) return false;
    if (/[<＜]\s*[语語]音/i.test(s)) return true;
    if (/[<＜]\s*字幕/i.test(s)) return true;
    return false;
}

export type SullyRepairPreviewSegment = {
    key: string;
    label: string;
    source: string;
};
