/** 修格式预览：需展示带标签/语气标注的源码（聊天语音条会洗掉标注） */
export function repairPreviewNeedsRawSource(source: string): boolean {
    const s = (source || '').trim();
    if (!s) return false;
    if (/[<＜]\s*[语語]音/i.test(s)) return true;
    if (/[<＜]\s*翻译/i.test(s)) return true;
    if (/[<＜]\s*字幕/i.test(s)) return true;
    if (/%%BILINGUAL%%/i.test(s)) return true;
    return false;
}

export type SullyRepairPreviewSegment = {
    key: string;
    label: string;
    source: string;
};
