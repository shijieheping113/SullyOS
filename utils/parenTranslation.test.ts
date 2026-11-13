import { describe, expect, it } from 'vitest';
import { PAREN_TRANSLATION_LOCK_CSS, splitParenTranslation } from './parenTranslation';

describe('气泡下中文样式锁', () => {
    it('钉死白字黑边，带 !important 压过美化', () => {
        expect(PAREN_TRANSLATION_LOCK_CSS).toContain('.sully-paren-translation');
        expect(PAREN_TRANSLATION_LOCK_CSS).toContain('color:#ffffff!important');
        expect(PAREN_TRANSLATION_LOCK_CSS).toContain('-webkit-text-fill-color:#ffffff!important');
        expect(PAREN_TRANSLATION_LOCK_CSS).toContain('text-shadow:');
        expect(PAREN_TRANSLATION_LOCK_CSS).toMatch(/text-shadow:[\s\S]*!important/);
        expect(PAREN_TRANSLATION_LOCK_CSS).toContain('font-weight:700!important');
        expect(PAREN_TRANSLATION_LOCK_CSS).toContain('z-index:20!important');
    });
});

const SAMPLE = 'コートの襟ちゃんと閉めて帰りなよ、俺も今から運転して帰るから家着いたらまた言うね（把外套领子拢好再走啊，我也现在开车回去了，到家再跟你说）';

describe('paren：日文（中文）', () => {
    it('整句末尾的中文摘下来，日文留在气泡', () => {
        const split = splitParenTranslation(SAMPLE, 'paren');
        expect(split?.original).toBe('コートの襟ちゃんと閉めて帰りなよ、俺も今から運転して帰るから家着いたらまた言うね');
        expect(split?.translations).toEqual(['把外套领子拢好再走啊，我也现在开车回去了，到家再跟你说']);
    });

    it('句尾是句号或汉字时，翻译不漏', () => {
        const punct = splitParenTranslation('帰りなよ。（把外套领子拢好再走）', 'paren');
        expect(punct?.original).toBe('帰りなよ。');
        expect(punct?.translations).toEqual(['把外套领子拢好再走']);

        const kanji = splitParenTranslation('もう大丈夫（已经没事了）', 'paren');
        expect(kanji?.original).toBe('もう大丈夫');
        expect(kanji?.translations).toEqual(['已经没事了']);
    });

    it('日文和括号之间有一个空格，仍算紧贴', () => {
        const split = splitParenTranslation('待って （等一下）', 'paren');
        expect(split?.original).toBe('待って');
        expect(split?.translations).toEqual(['等一下']);
    });

    it('两个字的中文也摘', () => {
        const split = splitParenTranslation('待って（好的）', 'paren');
        expect(split?.translations).toEqual(['好的']);
    });

    it('日文里的「」引用留在原文，译文里的「」留在中文', () => {
        const split = splitParenTranslation('「今日はいい天気だね」って言ってた（他说「今天天气真好」）', 'paren');
        expect(split?.original).toBe('「今日はいい天気だね」って言ってた');
        expect(split?.translations).toEqual(['他说「今天天气真好」']);
    });

    it('句中的（笑）留在气泡，只摘最后那对翻译', () => {
        const split = splitParenTranslation('彼は（笑）そう言った（他是这么说的）', 'paren');
        expect(split?.original).toBe('彼は（笑）そう言った');
        expect(split?.translations).toEqual(['他是这么说的']);
    });

    it('夹在日文中间的动作括号留下，句尾翻译摘下去', () => {
        const split = splitParenTranslation('コートの襟（揉了揉头发）ちゃんとして（把领子拢好）', 'paren');
        expect(split?.original).toBe('コートの襟（揉了揉头发）ちゃんとして');
        expect(split?.translations).toEqual(['把领子拢好']);
    });

    it('自己站着的动作，和翻译后面另起的动作，都留在气泡里', () => {
        const leading = splitParenTranslation('（夜风里他顿了顿）コートの襟ちゃんと閉めて（把外套领子拢好）', 'paren');
        expect(leading?.original).toBe('（夜风里他顿了顿）コートの襟ちゃんと閉めて');
        expect(leading?.translations).toEqual(['把外套领子拢好']);

        const trailing = splitParenTranslation('コートの襟ちゃんと閉めて（把外套领子拢好）（说完他发动了车子）', 'paren');
        expect(trailing?.original).toBe('コートの襟ちゃんと閉めて（说完他发动了车子）');
        expect(trailing?.translations).toEqual(['把外套领子拢好']);
    });

    it('同一段里两句紧贴的双语都摘，按顺序贴在下面', () => {
        const split = splitParenTranslation('待って（等一下）。もう大丈夫（已经没事了）', 'paren');
        expect(split?.original).toBe('待って。もう大丈夫');
        expect(split?.translations).toEqual(['等一下', '已经没事了']);
    });

    it('译文自己再套一层括号时整段中文都在下面', () => {
        const split = splitParenTranslation('待って（等一下（马上））', 'paren');
        expect(split?.original).toBe('待って');
        expect(split?.translations).toEqual(['等一下（马上）']);
    });

    it('半角括号同样认', () => {
        const split = splitParenTranslation('待って(等一下)', 'paren');
        expect(split?.translations).toEqual(['等一下']);
    });

    it('（笑）（汗）和单字（嗯），以及整句没有假名的，不拆', () => {
        expect(splitParenTranslation('そう（笑）', 'paren')).toBeNull();
        expect(splitParenTranslation('そう（汗）', 'paren')).toBeNull();
        expect(splitParenTranslation('うん（嗯）', 'paren')).toBeNull();
        expect(splitParenTranslation('大丈夫（已经没事了）', 'paren')).toBeNull();
        expect(splitParenTranslation('今天好（真的）', 'paren')).toBeNull();
        expect(splitParenTranslation('待って（等一下', 'paren')).toBeNull();
        expect(splitParenTranslation('「待って（等一下）」', 'paren')).toBeNull();
    });

    it('上一行日文、下一行中文，不拆', () => {
        expect(splitParenTranslation('待って\n等一下', 'paren')).toBeNull();
    });

    it('夹在中间的假名注音不挡路 —— 注音后面还挂着罗马字，也照样认出译文', () => {
        const split = splitParenTranslation('俺が言い掛かりつけただけだから、相手してよ(バオバオ)baobao（纯粹是我没话找话挑刺，理理我嘛宝宝）', 'paren');
        expect(split?.original).toBe('俺が言い掛かりつけただけだから、相手してよ(バオバオ)baobao');
        expect(split?.translations).toEqual(['纯粹是我没话找话挑刺，理理我嘛宝宝']);
    });

    it('假名注音紧贴在译文前面时穿过去，注音原样留在气泡', () => {
        const split = splitParenTranslation('そう言った（バオバオ）（他是这么说的）', 'paren');
        expect(split?.original).toBe('そう言った（バオバオ）');
        expect(split?.translations).toEqual(['他是这么说的']);
    });

    it('单字旁注紧贴在译文前面时穿过去，旁注原样留在气泡', () => {
        const one = splitParenTranslation('そう言った（笑）（他是这么说的）', 'paren');
        expect(one?.original).toBe('そう言った（笑）');
        expect(one?.translations).toEqual(['他是这么说的']);

        // 连着几对单字旁注，整串都能穿过去。
        const two = splitParenTranslation('そう言った（笑）（汗）（他是这么说的）', 'paren');
        expect(two?.original).toBe('そう言った（笑）（汗）');
        expect(two?.translations).toEqual(['他是这么说的']);
    });

    it('两个字的旁注不算单字，但夹在日文中间时照样不挡路', () => {
        // 只锁住「两字穿不过去」这一条：它不紧贴译文时不挡路，紧贴译文的那种写法
        // 会把旁注当译文摘下去，属已知的错位问题，不在这里断言，免得把错的样子钉死。
        const split = splitParenTranslation('彼は（笑声）そう言った（他是这么说的）', 'paren');
        expect(split?.original).toBe('彼は（笑声）そう言った');
        expect(split?.translations).toEqual(['他是这么说的']);
    });
});

describe('quoted：「日文（中文）」', () => {
    it('最外层引号包住整句时，气泡保留说话的引号', () => {
        const split = splitParenTranslation('「待って（等一下）」', 'quoted');
        expect(split?.original).toBe('「待って」');
        expect(split?.translations).toEqual(['等一下']);
    });

    it('里面的「」引用不会把外层引号提前关掉', () => {
        const split = splitParenTranslation('「彼は「今日はいい」と言った（他说「今天好」）」', 'quoted');
        expect(split?.original).toBe('「彼は「今日はいい」と言った」');
        expect(split?.translations).toEqual(['他说「今天好」']);
    });

    it('引号只包日文、中文在引号外面，也认', () => {
        const split = splitParenTranslation('「今日はいきなりどうしたの」（今天怎么突然说这个）', 'quoted');
        expect(split?.original).toBe('「今日はいきなりどうしたの」');
        expect(split?.translations).toEqual(['今天怎么突然说这个']);
    });

    it('句号夹在引号和括号之间，也认', () => {
        const split = splitParenTranslation('「もう大丈夫。」（已经没事了）', 'quoted');
        expect(split?.original).toBe('「もう大丈夫。」');
        expect(split?.translations).toEqual(['已经没事了']);
    });

    it('没有外层引号的句子不按这个格式拆', () => {
        expect(splitParenTranslation(SAMPLE, 'quoted')).toBeNull();
    });

    it('引用后面还有正文时，不把前半段引号当成格式', () => {
        expect(splitParenTranslation('「今日はいい」って言ってた（他说今天好）', 'quoted')).toBeNull();
    });
});

describe('语音和旧翻译标记', () => {
    it('语音标签、字幕、旧双语标记都不拆', () => {
        expect(splitParenTranslation('<语音>待って（等一下）</语音>', 'paren')).toBeNull();
        expect(splitParenTranslation('待って<字幕>等一下</字幕>', 'paren')).toBeNull();
        expect(splitParenTranslation('待って\n%%BILINGUAL%%\n等一下', 'paren')).toBeNull();
        expect(splitParenTranslation('<语音>「待って（等一下）」</语音>', 'quoted')).toBeNull();
    });
});
