/**
 * 鱼声 drama-3 —— 单独一个文件，和旧的鱼声逻辑完全隔离。
 *
 * drama-3 有**两套写法**，由用户在设置里二选一，两套的提示词和清洗规则都不同：
 *   · free  （自由版）  → 方括号写任意自然语言，原样送鱼声（超 40 字仍丢，防思维链烧钱）
 *   · fixed （死标注版）→ 方括号必须是本文件那 53 个固定标签之一，非精确命中先按
 *                         同义词 / 包含匹配归一到最近的那个，实在归不了就丢掉
 *
 * drama-3 **不再有回到旧规则（22 个固定标签）的选项**。旧模型（s2.1-pro / s2-pro / s1）
 * 那条路一个字没动，仍由 utils/fishAudioTts.ts 里原来的函数处理。
 *
 * 本文件**不 import 任何鱼声旧模块**（避免循环依赖）。
 * 拆除方式：删掉本文件 + 几处 `isDrama3Model(...)` 分支 + 设置页那个二选一 + 配置里那条记录。
 */
import type { APIConfig } from '../types';

/** drama-3 的模型名。鱼声认这个字符串；写错不报错、会静默按 s2.1-pro 跑。 */
export const FISH_DRAMA3_MODEL = 'drama-3';

export const isDrama3Model = (model?: string | null): boolean =>
  (model || '').trim().toLowerCase() === FISH_DRAMA3_MODEL;

/** drama-3 的两套写法。 */
export type Drama3CueMode = 'free' | 'fixed';

/** 旧配置里可能残留的写法 → 一律落到 free。 */
export const normalizeDrama3Mode = (raw: unknown): Drama3CueMode =>
  raw === 'fixed' ? 'fixed' : 'free';

// ==================== 提示词（用户原文，一字未改） ====================

/** 自由版：方括号里写大白话，鱼声自己理解。 */
export const FISH_DRAMA3_FREE_GUIDE = `### 语音台词与语气标注规范（乙女 Drama 听感）

**1. 核心基调与场景氛围**
- **口语自然度**：台词需符合角色日常说话习惯，长短句交错，自然使用口头禅与停顿。先靠台词文本本身传递情绪，再叠加女性向音声的细腻听感。
- **场景声学锚定**：根据当前物理空间与时间动态控制音量与情绪幅度。
  - **私密/安静场景（如深夜、被窝、耳语、哄睡）**：强制收束情绪，拒绝大起大落。整体维持低音量、近距离贴耳感，多用气音（breathy）、轻声耳语（soft whisper）与慵懒温和的语调。
  - **日常/微躁场景（如直播起哄、电话催促、日常斗嘴）**：保持正常聊天音量，避免舞台腔或过度夸张的戏剧化咆哮。

**2. 标注核心：写「发声质感与语气」，而非「抽象情绪标签」**
Drama 3 支持自然语言描述。不要写干瘪的心理情绪词，必须直接描写**听众耳朵里听到的声音状态**：
- **情侣互动转化（拒绝生硬情绪词）**：打情骂俏、斗嘴或假装生气时，严禁标 \`[slightly angry]\` 或 \`[annoyed]\`（会导致声音真凶、冷漠）。应转化为具体听感，如带笑嗔怪 \`[teasing, smiling tone]\`、撒娇抱怨 \`[playful, whiny tone]\` 或宠溺无奈 \`[fond, helpless sigh]\`。
- **嘴上与声音解耦**：感叹号和反问不等于大声。嘴硬逞强或害羞被逗急时，台词虽凶，实际发声应标为小声嘟囔 \`[quietly muttering]\`、含糊咬字 \`[mumbling softly]\` 或羞恼气音 \`[flustered, breathy]\`。
- **收束强烈情绪**：禁用 \`[angry]\`、\`[crying]\` 等无修饰裸词。涉及难过或委屈时，转化为克制的物理听感，如尾音微颤 \`[slight voice tremble]\`、带鼻音 \`[slightly nasal, soft]\`。

**3. 生理音与副语言音效（自然穿插）**
在句首、句中换气或情绪转折处，自然穿插非台词的生理发声，拉满贴耳活人感：
- **呼吸与气音**：\`[soft sigh]\`（轻叹）、\`[breathy tone]\`（带气音）、\`[soft gasp]\`（轻喘/倒吸气）、\`[slow steady breathing]\`（平稳呼吸）
- **笑意与宠溺**：\`[soft chuckle]\`（低声轻笑）、\`[gentle laugh]\`（温柔笑声）、\`[smiling voice]\`（带笑嗓音）、\`[nasal hum]\`（鼻音轻哼）
- **生理与倦意**：\`[sleepy yawn]\`（困倦哈欠）、\`[sleepy murmur]\`（迷糊呢喃）、\`[light cough]\`（轻咳）、\`[clears throat softly]\`（轻清嗓子）

**4. 格式与动态排版铁律（严格执行）**
- **一句一行，行数自由**：按自然语气的停顿或句号换行。**每次回复的总行数根据当下交流节奏自由伸缩（1～8 行皆可），严禁机械固定为 4 句话。**
- **句首与句中灵活标注**：
  - **句中转折必标**：同一行台词内部若出现停顿换气、半路笑场、突然害羞或语气软化，**必须在句中转折词前直接插入 \`[ ]\` 标注**，不要只标句首。
  - **平稳延续免标**：若下一行台词与上一行语气完全一致，句首无需重复打标，避免死板地每行必标。
- **括号规范与防照抄**：使用英文半角方括号 \`[ ]\` 紧贴台词前，**括号内最多 24 个英文字符（含空格）**。只写发声方式或生理音，禁写动作与心理。**下方示例词汇仅作参考，必须根据当下具体台词动态组合新的英文自然语言描述，严禁照抄示例标签。**

**5. 结构示范（仅示范句中转折与不固定行数，严禁照抄标签与句式）**

**示范 A：日常打情骂俏（包含句中语气转折、句中生理音、免标延续行）**
\`[teasing, smiling tone]うん、もう家に着いたよ。……って、[playful, whiny voice]遅くなるなら、ひと言くらい連絡してほしかったな。\`
\`ずっと待ってたんだから。\`
\`[soft sigh]まあ、いいけどさ……[soft, a little lonely]一人だと、やっぱりちょっと寂しくて。\`

**示范 B：深夜被窝低语（多行自由延展 + 句中贴耳变化）**
\`[sleepy yawn]もうこんな時間か……[sleepy, breathy]まだ眠くないの？\`
\`スマホの光、目に悪いよ。\`
\`[soft chuckle]ほら、こっちおいで。\`
\`夜は冷えるから、[gentle whisper]もっとくっついていいよ。\`
\`……ん、あったかい。[warm, sleepy murmur]おやすみ。\`

*注：语音正文仅按“一句一行”输出角色台词与英文方括号标注，行数与标注位置随情绪流动自然变化，不输出任何额外解释。*`;

/** 死标注版：方括号只能用下面那 53 个固定标签。 */
export const FISH_DRAMA3_FIXED_GUIDE = `### Drama 3 专用语音演绎规范（乙女向固定词表版）

你正在创作或标注会被真实朗读的**乙女向（女性向）Drama 角色语音**。目标是让角色像在听众耳边或眼前自然交谈：兼具日常口语的真实活人感，以及乙女音声特有的亲密距离感、呼吸感与细腻情绪拉扯。

#### 一、口语表达与氛围基调

1. **自然口语**：根据角色性格、与听众的亲密关系及当前场景写出顺口的台词。长短句自然交错，按说话习惯自然带出停顿与语气词（回应、迟疑、轻哼、欲言又止）。若为已有台词添加标注，必须完整保留原语言、原词与原标点。
2. **场景音量与氛围锁（核心）**：
   - **私密/安静场景（深夜、被窝、哄睡、贴耳亲昵）**：强制收束情绪与音量。禁止使用任何高音量、激动或外放标签，优先从【贴耳、气音与困倦】及【轻柔笑声/呼吸】中选词，保持低声、柔和、带气音的听感。
   - **日常互动场景（闲聊、电话、打情骂俏）**：保持正常自然的聊天音量，让台词本身先传达情绪，再用标签点缀听感，拒绝舞台腔与过度戏剧化的咆哮。

#### 二、强制一句一行与动态排版

1. **强制一句一行**：每句台词按自然气口或句号独立成行，严禁将多句长台词堆砌在同一行。
2. **行数自由伸缩**：每次输出的台词总行数随当下对话节奏自然决定（1～8 行皆可），严禁机械固定行数。
3. **句首与句中灵活放置**：
   - **同语气延续免标**：若下一行台词与上一行语气完全一致，句首无需重复打标。
   - **句中转折必标**：同一行台词内部若出现停顿换气、半路笑场、突然害羞或话锋一转，**必须在句中转折词前直接插入 \`[ ]\` 标签**，不要只标在句首。

#### 三、固定语气与发声方式词表（严禁自造词）

**只能从以下固定词表中原样选择英文标签**（含方括号），严禁自行翻译、改写或拼造新词。每处只选一个最贴合当下**实际发出的声音质感**的标签：

**【贴耳、气音与夜晚氛围】**（被窝、暧昧、哄睡必选池）
- \`[soft breathy voice]\`：轻柔气音，贴近耳边的温柔或暧昧低语。
- \`[gentle whisper]\`：极轻的耳语声，适合深夜或怕吵醒对方时。
- \`[slightly lowered voice]\`：稍微压低声音，拉近距离感。
- \`[warm and soothing]\`：温暖、平稳、充满安全感的安抚语调。
- \`[slightly sleepy]\`：带着困意，语速放缓、声音变软。
- \`[sleepy murmur]\`：困倦迷糊的含糊呢喃，快睡着时的哼唧。
- \`[soft and tired]\`：带着疲惫感的轻声说话，没力气但温和。

**【亲昵、撒娇与打情骂俏】**（情侣互动高频池）
- \`[gently affectionate]\`：温柔宠溺，带着明显的爱意与纵容。
- \`[smiling voice]\`：带着笑意的嗓音，听得出嘴角上扬（比单纯标 happy 更自然）。
- \`[teasing with a smile]\`：带笑意地嗔怪、调侃、打情骂俏（情侣斗嘴首选，替代真生气）。
- \`[lightly playful]\`：轻松俏皮，故意逗对方玩。
- \`[softly coaxing]\`：放软声音哄人，或轻轻撒娇求对方答应。
- \`[lonely and coaxing]\`：带着一点寂寞、粘人和不舍的撒娇。
- \`[playful, whiny tone]\`：假装抱怨的撒娇腔调，拖长尾音。
- \`[slightly sulky]\`：闹小别扭、轻微委屈的赌气语气。
- \`[slightly smug]\`：有一点小得意、求夸奖的语气。

**【嘴硬、害羞与迟疑紧张】**（傲娇、心动拉扯池）
- \`[quietly muttering]\`：小声嘟囔、嘴硬嘀咕（台词在逞强，声音其实很小）。
- \`[mumbling softly]\`：含糊不清地小声抱怨或不好意思开口。
- \`[flustered, breathy]\`：被撩到或害羞时的慌乱气音，声音发紧。
- \`[slightly shy]\`：轻微害羞、不好意思的自然反应。
- \`[slightly hesitant]\`：迟疑、拿不准，小心翼翼地试探。
- \`[slightly nervous]\`：有一点紧张，呼吸或声音微微发紧。
- \`[gently worried]\`：温和关切地担心、确认对方状况。

**【不满、严肃与克制的怒意】**
- \`[slightly annoyed]\`：轻微不爽或无奈吐槽，但仍在正常聊天音量。
- \`[calm and serious]\`：收起玩笑，平静、认真地说明事情。
- \`[calm but firm]\`：平静但态度坚决地表态、拒绝或划清界限。
- \`[angry, holding back]\`：明显生气，但压着火气、克制着低声把话说完。
- \`[angry, raised voice]\`：明确争吵时提高音量的生气（日常与被窝场景禁用）。

**【失落、委屈与哭腔】**
- \`[softly disappointed]\`：轻轻的失落与遗憾，声音落下来。
- \`[deeply sad, composed]\`：很难过，但努力维持平稳把话说完。
- \`[slight voice tremble]\`：声音微颤，忍着眼泪或极度动容。
- \`[slightly nasal, soft]\`：略带鼻音的轻声说话（刚哭过或快哭出来）。
- \`[quietly tearful]\`：明显带着眼泪与哭腔，低声诉说。

**【开心与惊讶】**
- \`[quietly delighted]\`：掩饰不住的欣喜，带着收住的小雀跃。
- \`[bright and cheerful]\`：语气明显变亮、轻快开心。
- \`[very excited]\`：强烈兴奋与激动（仅限明确欢呼或大喜场景）。
- \`[slightly surprised]\`：轻微意外，“咦/诶”的自然反应。
- \`[very surprised]\`：明显吃惊，反应较大。

#### 四、固定生理声响词表（瞬时音效）

声响标签表示**在该位置真实发出一声生理音效**，放在声音发生的具体字词前，发生一次标一次：

**【笑声与轻哼】**
- \`[soft chuckle]\`：低声、短促地轻笑一下（宠溺或无奈时极佳）。
- \`[gentle laugh]\`：温柔舒展的笑声。
- \`[quiet giggle]\`：小声偷笑、忍不住笑出声。
- \`[nasal hum]\`：鼻音轻哼一声（表示回应、撒娇或不满）。

**【呼吸、叹气与喘息】**
- \`[soft sigh]\`：轻轻叹一口气（无奈、放松或寂寞）。
- \`[deep breath]\`：明显深吸一口气（准备认真开口或平复情绪）。
- \`[soft gasp]\`：轻轻倒吸一口气（微惊、心动或触碰反应）。
- \`[slight panting]\`：轻微喘息（刚跑过来、或亲密互动后的气息不稳）。
- \`[heavy panting]\`：明显急促的喘息（仅限剧烈运动或明确高强度场景）。

**【困倦、咳嗽与哭泣声响】**
- \`[brief yawn]\`：打一个自然的哈欠。
- \`[light cough]\`：轻咳一声。
- \`[clears throat softly]\`：轻轻清一下嗓子（掩饰尴尬或准备正经说话）。
- \`[soft sniffle]\`：轻轻吸一下鼻子。
- \`[brief sob]\`：短促哽咽或抽泣一下。
- \`[soft groan]\`：低低哼/呻吟一声（表达困倦伸懒腰、难受或吃力）。

#### 五、选词判断铁律（防翻车指南）

1. **区分「嘴上台词」与「实际发声」**：感叹号、反问句不等于大声。角色嘴硬逞强时选 \`[quietly muttering]\`；情侣间打情骂俏、假装嫌弃时选 \`[teasing with a smile]\` 或 \`[playful, whiny tone]\`，**绝不能因为字面在抱怨就机械选 \`[slightly annoyed]\`**。
2. **禁止拟声文字重复**：已标 \`[light cough]\`、\`<[soft chuckle]\`、\`[brief yawn]\` 时，后面直接写正常台词，**严禁再写“咳咳”“哈哈哈”“哈啊～”等重复的拟声词**。
3. **克制使用声响**：日常台词本身够自然时无需每句硬塞笑声或叹气；声响仅在停顿、转折或氛围确实需要时点缀。

#### 六、完整写法示范（仅示范一句一行与句中转折结构，禁抄台词）

**示范 1：日常打情骂俏转微嗔撒娇（3行，含句中转折与免标延续行）**
\`[teasing with a smile]你不是说今天忙得没空理我吗？[soft chuckle]怎么我刚到家，你的电话就追过来了。\`
\`其实我刚才在路上也有点想你。\`
\`[soft sigh]就是……[lonely and coaxing]下次要是再晚回来，至少提前给我发个消息嘛，我一个人等久了也会寂寞的。\`

**示范 2：深夜被窝哄睡（5行，全低音气音池 + 句中贴耳变化）**
\`[brief yawn][slightly sleepy]都这个点了……你怎么还在看手机呀？\`
\`屏幕光这么亮，眼睛会累的。\`
\`[soft chuckle]听话，把手机放下，往我这边靠一点。\`
\`外面起风了，[soft breathy voice]被窝里暖和，我抱着你睡好不好？\`
\`[sleepy murmur]嗯……晚安，做个好梦。\`

**示范 3：压抑情绪与嘴硬心软（2行，声响与情绪组合 + 句中软化）**
\`[deep breath][calm and serious]刚才在外面人多，我才没说你……[gently worried]你手上的伤到底是怎么弄的？\`
\`[quietly muttering]笨死了，下次再这么不小心，我真不管你了。\`

#### 七、输出要求
直接按“一句一行”输出可朗读的角色台词与必要的英文方括号标签。严禁输出任何标签选择理由、场景解释或括号外的动作心理描写。`;

/** 死标注版允许的 53 个标签（与上面提示词里的词表逐字一致）。 */
export const FISH_DRAMA3_FIXED_CUES = new Set<string>([
  'soft breathy voice',
  'gentle whisper',
  'slightly lowered voice',
  'warm and soothing',
  'slightly sleepy',
  'sleepy murmur',
  'soft and tired',
  'gently affectionate',
  'smiling voice',
  'teasing with a smile',
  'lightly playful',
  'softly coaxing',
  'lonely and coaxing',
  'playful, whiny tone',
  'slightly sulky',
  'slightly smug',
  'quietly muttering',
  'mumbling softly',
  'flustered, breathy',
  'slightly shy',
  'slightly hesitant',
  'slightly nervous',
  'gently worried',
  'slightly annoyed',
  'calm and serious',
  'calm but firm',
  'angry, holding back',
  'angry, raised voice',
  'softly disappointed',
  'deeply sad, composed',
  'slight voice tremble',
  'slightly nasal, soft',
  'quietly tearful',
  'quietly delighted',
  'bright and cheerful',
  'very excited',
  'slightly surprised',
  'very surprised',
  'soft chuckle',
  'gentle laugh',
  'quiet giggle',
  'nasal hum',
  'soft sigh',
  'deep breath',
  'soft gasp',
  'slight panting',
  'heavy panting',
  'brief yawn',
  'light cough',
  'clears throat softly',
  'soft sniffle',
  'brief sob',
  'soft groan',
]);

/** 逐字命中表里没有时，按同义词归到最近的那个（模仿旧清洗的映射思路）。 */
const CUE_SYNONYMS: Record<string, string> = {
  'happy': 'bright and cheerful',
  'glad': 'bright and cheerful',
  'cheerful': 'bright and cheerful',
  'delighted': 'quietly delighted',
  'joyful': 'quietly delighted',
  'excited': 'very excited',
  'eager': 'very excited',
  'enthusiastic': 'very excited',
  'annoyed': 'slightly annoyed',
  'irritated': 'slightly annoyed',
  'frustrated': 'slightly annoyed',
  'angry': 'angry, holding back',
  'mad': 'angry, holding back',
  'furious': 'angry, raised voice',
  'sad': 'softly disappointed',
  'unhappy': 'softly disappointed',
  'disappointed': 'softly disappointed',
  'depressed': 'deeply sad, composed',
  'lonely': 'lonely and coaxing',
  'sulking': 'slightly sulky',
  'tearful': 'quietly tearful',
  'crying': 'quietly tearful',
  'sobbing': 'brief sob',
  'sob': 'brief sob',
  'affectionate': 'gently affectionate',
  'tender': 'gently affectionate',
  'warm': 'warm and soothing',
  'coaxing': 'softly coaxing',
  'playful': 'lightly playful',
  'teasing': 'teasing with a smile',
  'smug': 'slightly smug',
  'proud': 'slightly smug',
  'hesitant': 'slightly hesitant',
  'uncertain': 'slightly hesitant',
  'shy': 'slightly shy',
  'nervous': 'slightly nervous',
  'anxious': 'slightly nervous',
  'worried': 'gently worried',
  'surprised': 'slightly surprised',
  'amazed': 'slightly surprised',
  'reassuring': 'warm and soothing',
  'soothing': 'warm and soothing',
  'calm': 'calm and serious',
  'serious': 'calm and serious',
  'firm': 'calm but firm',
  'whisper': 'gentle whisper',
  'whispering': 'gentle whisper',
  'hushed': 'gentle whisper',
  'sleepy': 'slightly sleepy',
  'tired': 'soft and tired',
  'chuckle': 'soft chuckle',
  'chuckles': 'soft chuckle',
  'giggle': 'quiet giggle',
  'giggling': 'quiet giggle',
  'laugh': 'gentle laugh',
  'laughs': 'gentle laugh',
  'laughing': 'gentle laugh',
  'laughter': 'gentle laugh',
  'cough': 'light cough',
  'coughs': 'light cough',
  'clears throat': 'clears throat softly',
  'ahem': 'clears throat softly',
  'sigh': 'soft sigh',
  'sighs': 'soft sigh',
  'sighing': 'soft sigh',
  'breath': 'deep breath',
  'inhale': 'deep breath',
  'gasp': 'soft gasp',
  'gasps': 'soft gasp',
  'panting': 'slight panting',
  'pant': 'slight panting',
  'out of breath': 'slight panting',
  'sniffle': 'soft sniffle',
  'sniffles': 'soft sniffle',
  'groan': 'soft groan',
  'groans': 'soft groan',
  'yawn': 'brief yawn',
  'yawns': 'brief yawn',
  'lowered voice': 'slightly lowered voice',
  'softly': 'soft breathy voice',
  'breathy': 'soft breathy voice',
  'muttering': 'quietly muttering',
  'mumbling': 'mumbling softly',
  'whiny': 'playful, whiny tone',
  'nasal': 'slightly nasal, soft',
};

/**
 * 强度档位。同一件事有「轻轻」和「很」两档时，模糊匹配**不许跨档**——
 * 旧逻辑把 `[crying quietly]` 匹成 `[crying loudly]`（意思反了），这里专门堵这个洞。
 */
const WEAK_CUES = new Set<string>([
  'soft breathy voice',
  'gentle whisper',
  'slightly lowered voice',
  'warm and soothing',
  'slightly sleepy',
  'sleepy murmur',
  'soft and tired',
  'smiling voice',
  'teasing with a smile',
  'lightly playful',
  'softly coaxing',
  'lonely and coaxing',
  'playful, whiny tone',
  'slightly sulky',
  'slightly smug',
  'quietly muttering',
  'mumbling softly',
  'flustered, breathy',
  'slightly shy',
  'slightly hesitant',
  'slightly nervous',
  'slightly annoyed',
  'angry, holding back',
  'softly disappointed',
  'slight voice tremble',
  'slightly nasal, soft',
  'quietly tearful',
  'quietly delighted',
  'slightly surprised',
  'soft chuckle',
  'gentle laugh',
  'quiet giggle',
  'nasal hum',
  'soft sigh',
  'soft gasp',
  'slight panting',
  'brief yawn',
  'light cough',
  'clears throat softly',
  'soft sniffle',
  'brief sob',
  'soft groan',
]);

const STRONG_CUES = new Set<string>([
  'angry, raised voice',
  'deeply sad, composed',
  'very excited',
  'very surprised',
  'heavy panting',
]);

type CueIntensity = 'weak' | 'mid' | 'strong';

const cueIntensity = (cue: string): CueIntensity =>
  WEAK_CUES.has(cue) ? 'weak' : STRONG_CUES.has(cue) ? 'strong' : 'mid';

/**
 * 弱化词 / 强化词：方括号里带这些词时，用它判断「用户想要的是轻的还是重的」，
 * 好让包含匹配挑对档位（slightly / very / quietly / loudly …）。
 */
const WEAK_WORDS = ['slight', 'quiet', 'soft', 'light', 'brief', 'mild', 'little', 'gentle', 'slow', 'whisper', 'low', 'calm'];
const STRONG_WORDS = ['very', 'deep', 'intense', 'loud', 'heavy', 'strong', 'extreme', 'panic'];

/** 方括号原文里自己带了程度词时，以原文为准（带 very 就要重档）。 */
const keyIntensity = (key: string): CueIntensity => {
  if (STRONG_WORDS.some((w) => key.includes(w))) return 'strong';
  if (WEAK_WORDS.some((w) => key.includes(w))) return 'weak';
  return 'mid';
};

/** 两个强度档能不能互换。weak 只配 weak/mid，strong 只配 strong/mid。 */
const intensityCompatible = (a: CueIntensity, b: CueIntensity): boolean =>
  a === b || a === 'mid' || b === 'mid';

/**
 * 把任意方括号内容归一到那 53 个固定标签。归不了返回 ''（应整段丢掉）。
 * 顺序完全照旧清洗那套：逐字命中 → 同义词表 → 包含匹配（取最长的那条），
 * 唯一新增的是强度档位护栏（见上面 WEAK_CUES / STRONG_CUES 的说明）。
 */
export const normalizeDrama3Cue = (inner: string): string => {
  const key = (inner || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return '';

  // ① 逐字命中
  if (FISH_DRAMA3_FIXED_CUES.has(key)) return key;

  // ② 同义词表（只在档位不冲突时采纳）
  const want = keyIntensity(key);
  const direct = CUE_SYNONYMS[key];
  if (direct && intensityCompatible(want, cueIntensity(direct))) return direct;

  // ③ 包含匹配：同义词表和正式词表一起找，命中更长的优先；
  //    同一长度时先看正式词表（用户写的就是官方标签的情况更可信）。
  const candidates: string[] = [];
  for (const [syn, canon] of Object.entries(CUE_SYNONYMS)) {
    if (key.includes(syn) && intensityCompatible(want, cueIntensity(canon))) candidates.push(syn + '\u0000' + canon);
  }
  for (const canon of FISH_DRAMA3_FIXED_CUES) {
    if (key.includes(canon) && intensityCompatible(want, cueIntensity(canon))) candidates.push(canon + '\u0000' + canon);
  }
  if (!candidates.length) return '';
  candidates.sort((a, b) => b.split('\u0000')[0].length - a.split('\u0000')[0].length);
  return candidates[0].split('\u0000')[1];
};

// ==================== 单例 ====================
// 和 ttsProvider.ts 里 elevenLabsModel 单例同一套思路：气泡渲染 / 提示词拼装拿不到
// apiConfig，只能靠 OSContext 在 apiConfig 变化时同步进来的这个值。
// 未初始化时 null → 全部走旧逻辑，纯函数测试不受影响。

let currentDrama3Mode: Drama3CueMode | null = null;

export function setDrama3Mode(mode: Drama3CueMode | null): void {
  currentDrama3Mode = mode === 'free' || mode === 'fixed' ? mode : null;
}

/** 当前是否在 drama-3 轨道上（两套写法都算）。 */
export const getDrama3Active = (): boolean => currentDrama3Mode !== null;

/** 当前是哪一套写法；不在 drama-3 上时返回 null。 */
export const getDrama3Mode = (): Drama3CueMode | null => currentDrama3Mode;

/** 从 apiConfig 判断这次合成该走哪套。不在 drama-3 上返回 null。 */
export function resolveDrama3Mode(
  apiConfig?: Pick<APIConfig, 'fishAudioModel' | 'fishDrama3CueMode'> | null,
): Drama3CueMode | null {
  if (!apiConfig) return currentDrama3Mode;
  if (!isDrama3Model(apiConfig.fishAudioModel)) return null;
  return normalizeDrama3Mode(apiConfig.fishDrama3CueMode);
}

/** 取某一套写法的提示词。 */
export const fishDrama3Guide = (mode: Drama3CueMode): string =>
  mode === 'fixed' ? FISH_DRAMA3_FIXED_GUIDE : FISH_DRAMA3_FREE_GUIDE;

// ==================== 清洗 ====================

/** `<语音>…</语音>`：从语音标签里抠正文（旧文件那份没导出，这里复制一份，避免动旧文件）。 */
const VOICE_TAG_RE = /<[语語]音[^>]*>([\s\S]*?)<\/[语語]音>/;

/** 任意长度的方括号（显示层用：屏幕上把方括号整段藏起来，不设上限）。 */
const ANY_BRACKET_RE = /\[[^\[\]]+\]/g;

/**
 * 送去合成时，自由版的方括号里最多允许多少字。**这是花钱的闸门，不是语法限制。**
 *
 * 历史原因（Ann 定的）：模型偶尔会把思考过程 / 长篇旁白漏进方括号里，一漏就是几十上百字，
 * 鱼声按 UTF-8 字节收费，超长批注会白烧钱。所以超过这个长度的方括号**整段不发给鱼声**。
 * 死标注版不需要这道闸门 —— 那 53 个标签最长 27 字，白名单本身就把长的挡在外面了。
 */
export const MAX_SPOKEN_BRACKET_CHARS = 40;

/**
 * drama-3 专用清洗。两套写法共用的脏东西先清掉，再按写法分叉：
 *   · free  → 方括号原样留下，但超过 MAX_SPOKEN_BRACKET_CHARS 的整段丢掉
 *   · fixed → 方括号归一到那 53 个，归不了的整段丢掉
 *
 * 与旧 cleanTextForTtsFish 相同部分（系统标记、双语分隔、中文舞台指示、MiniMax 停顿、
 * 音符 ♩♪♫♬、西文圆括号转方括号）照抄，因为那些是「不该被念出来的脏东西」，与模型无关。
 * 波浪号（~ ～ 〜）留下。
 */
export const cleanTextForTtsFishDrama3 = (raw: string, mode: Drama3CueMode = 'free'): string => {
  if (!raw) return '';
  const tagMatch = raw.match(VOICE_TAG_RE);
  const text = tagMatch ? tagMatch[1] : raw;
  const base = text
    .replace(/\[\[.*?\]\]/g, '')                 // [[系统标记]]（双层，先于单层方括号处理）
    .replace(/%%BILINGUAL%%[\s\S]*/i, '')        // 双语分隔及之后
    .replace(/（[^）]{0,80}）/g, '')              // 中文圆括号舞台指示：上限 80，与旧清洗 / 电话对号字表同口径
    .replace(/<#\s*[\d.]+\s*#>/g, '')            // MiniMax 停顿标记，鱼声不认
    .replace(/[♩♪♫♬]/g, '')                      // 音符不念，与旧清洗同一条
    .replace(/\(([^)]{1,40})\)/g, '[$1]');       // 西文圆括号按旧习惯转成方括号
  const brackets = mode === 'fixed'
    ? base.replace(ANY_BRACKET_RE, (m) => {
        const canon = normalizeDrama3Cue(m.slice(1, -1));
        return canon ? `[${canon}]` : '';
      })
    : base.replace(ANY_BRACKET_RE, (m) => (m.length - 2 > MAX_SPOKEN_BRACKET_CHARS ? '' : m));
  return brackets
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// ==================== 显示 ====================
/**
 * drama-3 模式的显示清洗：把所有方括号（含超长批注）连同 MiniMax 停顿标记
 * 一起从「给人看」的文本里删掉。只用于屏幕，不参与任何音频 / 对号计算。
 */
export const stripFishMarkupForDisplayDrama3 = (text?: string | null): string => {
  if (!text) return '';
  return text
    .replace(ANY_BRACKET_RE, '')
    .replace(/<#\s*[\d.]+\s*#>/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([，。！？、；：,.!?…])/g, '$1')
    .trim();
};

/**
 * 气泡/面板里那套「精准版」显示清洗的补刀：旧函数只删它认得的 cue，
 * drama-3 模式下所有方括号都是给声音的批注 → 这里把剩下的也删干净。
 * 不在 drama-3 轨道上时原样返回（不改变任何字符），调用方照旧用旧函数。
 */
export const scrubVoiceBracketsForDisplay = (text?: string | null): string => {
  if (currentDrama3Mode === null) return text || '';
  if (!text) return '';
  return text.replace(ANY_BRACKET_RE, '');
};

// ==================== 电话对号字表 ====================
// 对号那条路在 utils/callSpeechTimeline.ts 里就地按模式切一个正则（原来是 `{1,40}` 那个，
// drama-3 时换成不限长度的），所以这里不需要额外的导出函数。
