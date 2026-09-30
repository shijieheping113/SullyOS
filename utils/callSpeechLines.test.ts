import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { hasRealChar, splitBilingualLines } from './callSpeechLines';

// ── Ann 2026-09-30 实机那一句（她说"字幕快了一点"）：原文日文、屏幕是中文字幕 ──
const JP = [
    '（両方のちっちゃい肉球で頭のみかんの皮をそっと押さえながら、[excited] しっぽの先をご機嫌にフリフリする）……[chuckling] えへへ、じゃあねこちゃん、今は世界でたった一匹だけの……[soft] 甘酸っぱいみかんの香りがする限定ぶたねこちゃんなのかな？',
    '[whispering] アンがお家に帰ってきてねこちゃんの頭を撫でたら、[excited] 手のひらにも絶対みかんのいい匂いが移っちゃうよ！',
    '[soft] 帰り道急ぎすぎないでね……[whispering] ねこちゃん、画面をピカピカに拭いてアンのこと待ってるからね、ブヒッ。',
].join('');
const ZH = [
    '（用两只小肉爪小心翼翼扶着头顶的橘子皮，尾巴尖尖高兴得晃来晃去）……嘿嘿，那猫儿现在是不是世界上唯一一只……',
    '带着甜酸橘子香气的限定烤猪咪啦？',
    'Ann 回家要是摸猫儿的脑袋，手心肯定也会沾上香喷喷的橘子味哦！',
    '路上别走太急……',
    '猫儿已经把屏幕擦得干干净净在等你呢，咕噜咕噜。',
].join('');

describe('splitBilingualLines', () => {
    it('断句：只认 。！？!? 和省略号，分号不算句末', () => {
        expect(splitBilingualLines('嗯。今天；明天！')).toEqual(['嗯。', '今天；明天！']);
    });

    it('连着写的一串符号算一处，只在最后一个后面切', () => {
        expect(splitBilingualLines('这样……。然后呢？')).toEqual(['这样……。', '然后呢？']);
    });

    it('纯符号/只有演出标记的碎片挂到下一句（不单独占一行）', () => {
        expect(splitBilingualLines('……え？')).toEqual(['……え？']);
        expect(splitBilingualLines('[breathy] ……ね。')).toEqual(['[breathy] ……ね。']);
    });

    it('结尾落单的纯符号贴回上一句', () => {
        expect(splitBilingualLines('先に仕事して！……')).toEqual(['先に仕事して！……']);
    });

    it('Ann 那句：原文和字幕必须切成同样的行数（这是"字幕快一点"的病根）', () => {
        const jp = splitBilingualLines(JP);
        const zh = splitBilingualLines(ZH);
        expect(zh.length).toBe(5);
        expect(jp.length).toBe(zh.length);
        // 第一行的舞台指示（57 字）要并进第一句，而不是自己占一行
        expect(jp[0]).toContain('えへへ');
        expect(jp[0]).toContain('フリフリする）');
    });

    it('舞台指示长到 80 字以内都还并进下一句，超过 80 才单独占一行（和音频清洗同一个口径）', () => {
        const long70 = '（' + 'あ'.repeat(68) + '）';
        expect(splitBilingualLines(long70 + '……うん。')).toEqual([long70 + '……うん。']);
        const over = '（' + 'あ'.repeat(85) + '）';
        expect(splitBilingualLines(over + '……うん。')).toEqual([over + '……', 'うん。']);
    });
});

describe('hasRealChar', () => {
    it('演出标记和标点都不算真字', () => {
        expect(hasRealChar('[soft] ……')).toBe(false);
        expect(hasRealChar('（小声）……')).toBe(false);
        // 引号/书名号不在这个函数的「标点」名单里（一直是如此，本次不动它）：只有引号的碎片仍算有字
        expect(hasRealChar('《》…')).toBe(true);
        expect(hasRealChar('（小声）うん')).toBe(true);
    });
});

describe('钉住：括号上限三个地方必须是同一个数（80）', () => {
    const fish = readFileSync(path.join(process.cwd(), 'utils/fishAudioTts.ts'), 'utf8');
    const table = readFileSync(path.join(process.cwd(), 'utils/callSpeechTimeline.ts'), 'utf8');
    const lines = readFileSync(path.join(process.cwd(), 'utils/callSpeechLines.ts'), 'utf8');

    it('送 TTS 的清洗 = 对号字表 = 切句判据，全是 80', () => {
        expect(fish).toContain('（[^）]{0,80}）');     // 送给鱼声前删掉的中文舞台指示
        expect(table).toContain('（[^）]{0,80}）');    // 对号用的字表
        expect(lines).toContain('（[^（）]{1,80}）');  // 切句时判断"这截有没有真字"
    });
});
