/**
 * 鱼声 drama-3 —— 单独一个文件，和旧的鱼声逻辑完全隔离。
 *
 * drama-3 有**两套写法**，由用户在设置里二选一，两套的提示词和清洗规则都不同：
 *   · free  （自由版）  → 方括号写任意自然语言，原样送鱼声（超 40 字仍丢，防思维链烧钱）
 *   · fixed （死标注版）→ 方括号必须是本文件那 56 个固定标签之一，非精确命中先按
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
export const FISH_DRAMA3_FREE_GUIDE = `### 让它听起来像角色真的在说话

**默认按日常语音来写。** 无论是聊天、电话、直播，还是其他口头交流，都用这位角色平时会说出口的话。句子有长有短，口头语和停顿用在自然的位置。直播有人起哄、电话里说话着急，也可以保持平常聊天的音量。让台词本身先承担情绪。

**1. 先判断角色会怎么说**

看角色的性格、他在对谁说话、他想让对方听出什么。把**心里的情绪、嘴上说的话、实际发出的声音**分开判断。胆小、爱撒娇的角色被逗急了，可能嘴上在逞强，实际只是小声嘀咕或含混地抱怨。感叹号、反问、动作描写都不能单独决定音量。

日常的开心、关心、吐槽和抱怨，台词本身能传达时就直接说。如果情绪容易被读平、读错，或者可能把程度演得过重，就用标注明确这一处该怎么说。

**2. 用简短英文写出听感，容易演重的情绪必须限定程度**

标注统一用**英文**，台词使用当前指定的语言。每个标注只写一个短语，**括号内最多 24 个英文字符，空格和标点也计入**。优先用一个具体词组说明听众应该听见什么。角色的动作、内心和场景用于判断语气，括号中只写与发声有关的指令。

- **情绪方向容易听不出来时，写准确的情绪和程度。** 轻微不满可用 \`[slightly annoyed]\`。如果换成坚定地说，可能听起来冷或严厉。小心试探可用 \`[a little hesitant]\`，让听众听出迟疑。
- **情绪容易演过头时，写有程度的具体声音。** 忍着哭把话说完，可用 \`[slight voice tremble]\`。想让一句反驳听起来像小声嘀咕，可用 \`[quietly muttering]\`。像 \`[angry]\`、\`[crying]\` 这样没限定程度的标注，容易让模型自行决定力度。涉及愤怒、悲伤、恐惧等容易演重的情绪时，*必须明确写出程度、音量或克制的听感*。
- **强烈表演只用于少数确实需要的场景。** 大喊、尖叫、大哭和恐慌都要有明确的情境依据，并且符合角色当下真的会发出的声音。日常语音优先维持角色平时的音量和情绪幅度。

标注要贴合此刻想表达的感情。 例如声音微颤、略带鼻音、轻声抱怨、迟疑地开口、略带不满，都各有适合的场景。根据当下角色和台词选词。这些短语用来示范怎么写。根据每条台词选词，保留真正影响听感的那一个特点。

**3. 标注明显变化，不要频繁换行**

语气标注用半角方括号 \`[ ]\`，紧贴在需要改变说法的台词前。整段语气一致，开头标一次即可。中途有明显变化，可以再标一次。连续几句延续同一种语气时，就不能再标注，而是让它自然接下去。每次加标注前，判断这一处是否确实需要让听众听出新的变化。

**不要频繁换行。** Drama3 会把换行当成停顿。频繁换行容易造成反复换气、喘息和不自然的中断。多句话使用标点自然衔接，省略号留给确实犹豫或没说完的地方。已有台词时保留原词和标点，把换行合成一行。台词里已有的喘息、口吃或拟声可以直接保留。只有笑、叹气等声音本身确实有用时，才在发生处标一次。语气统一由行内方括号控制。

**4. 完整示例**

这是给恋人发的一条语音。开头有一点不高兴，接着说清楚自己为什么介意。后面才露出寂寞，声音放软，带一点想被陪着的感觉。

\`うん、もう家に着いたよ。[mildly annoyed]遅くなるなら、ひと言くらい連絡してほしかったよ。ずっと待ってたんだから。[a little lonely]先に帰ってきたけど、一人だとちょっと寂しくてさ。ねえ、今から少しだけ電話してもいい？\`

按这个格式写当前角色自己的台词。语音正文只放一行台词和必要的英文标注。`;

/** 死标注版：方括号只能用下面那 56 个固定标签。 */
export const FISH_DRAMA3_FIXED_GUIDE = `### Drama3 专用语音演绎规范

你正在写会被真实朗读的角色对白。目标是让角色像在和眼前的人自然交谈：台词顺口，情绪准确，声音连贯。

一、口语表达

根据角色性格、关系和当前场景写自然的口语。句子长短自然变化，使用台词所属语言里合适的语气词，语气词表达实际反应：回应、迟疑、惊讶、欲言又止。按对话需要使用，不固定添加位置。

给已有台词添加标注时，保留原语言、原词和原标点。

二、完整朗读文本不换行

尽量不要换行。Drama3 会把换行当成停顿。频繁换行容易造成反复换气、喘息和不自然的中断。多句话使用正常标点衔接，非必要停顿不换行。

逗号用于短停顿，句号用于自然收句，省略号用于确实存在的迟疑或未尽之意。标点按说话需要使用，不靠连续碎句或密集省略号制造情绪。

三、情绪必须包含程度

选择情绪标签前，判断：
1. 角色正在表达什么情绪。
2. 情绪在声音里表现到什么程度。
3. 角色是在克制，还是已经直接释放出来。

内心情绪强烈，不等于声音必须激烈。很难过但忍着眼泪、很生气但压着火，都要选择对应的克制表达。

普通聊天以轻度表达为主。上下文明确需要更强表现时，再选择较强标签。不能只写没有程度限定的 happy、angry、sad、crying 等裸情绪词。

四、固定情绪与说话方式标签

只能从以下词表中选择，方括号内英文原样使用。

【开心与兴奋】
[slightly happy]：轻微开心，语气自然亮一点。
[quietly delighted]：明显欣喜，带着收住的雀跃。
[moderately excited]：明确兴奋，语气活跃、有起伏。
[very excited]：强烈兴奋，适用于明确激动、欢呼的场景。

【生气与不满】
[slightly annoyed]：轻微不爽、烦躁，仍在正常交谈。
[moderately angry]：明确生气，语气变重。
[very angry but controlled]：很生气，压着火把话说清楚。
[very angry, raised voice]：很生气并提高音量，适用于明确争吵。

【难过、悲伤与哭意】
[slightly sad]：轻微难过、失落。
[moderately sad]：明显难过，仍能顺畅说话。
[deeply sad but composed]：深切悲伤，努力维持平静。
[voice trembling slightly]：声音微颤，忍着眼泪或快哭出来，仍在把话说完。
[quietly tearful]：明显带着眼泪和哭腔，低声说话。

【亲近、撒娇与玩笑】
[gently affectionate]：温柔亲近，带着爱意。
[lightly coaxing]：轻轻撒娇，想让对方答应。
[slightly lonely and coaxing]：有一点寂寞和不舍，黏着对方撒娇。
[lightly playful]：轻松俏皮，逗对方玩。
[slightly smug]：有一点得意，轻轻炫耀。
[slightly sulky]：有一点委屈，闹小别扭。

【犹豫、害羞与担心】
[slightly hesitant]：轻微迟疑，试探对方的反应。
[very hesitant but calm]：顾虑较重，斟酌着开口，仍保持镇定。
[slightly shy]：轻微害羞、不好意思。
[slightly uncertain]：有一点拿不准。
[slightly nervous]：有一点紧张，声音稍微发紧。
[slightly worried]：轻微担心，关切地确认。
[very worried but composed]：很担心，仍在稳住自己说话。

【害怕与惊讶】
[slightly frightened]：有一点害怕。
[very frightened]：明显恐惧，适用于确有危险或受到强烈惊吓的场景。
[slightly surprised]：轻微意外。
[very surprised]：明显吃惊，反应较强。

【说话方式】
[gently reassuring]：温柔、平稳地安抚。
[slightly lowered voice]：稍微降低音量。
[quiet whisper]：低声耳语。
[slightly sleepy]：有一点困，带着睡意。
[slightly tired]：有一点疲惫。
[calm and serious]：平静、认真地说明。
[calm but firm]：平静而坚决地表态或划清界限。

五、固定声响标签

声响标签表示真的发出声音。放在声音实际发生的位置，发生一次标一次，不作为整段情绪标签使用。

【笑声】
[soft chuckle]：短促、轻轻笑一下。
[quiet giggle]：小声咯咯笑、忍不住偷笑。
[brief laugh]：正常笑一声。
[loud laughter]：明显大笑，适用于场景确实要求放声笑。

【咳嗽与清嗓】
[light cough]：轻咳一声。
[coughing]：明显咳嗽，适用于场景确实正在咳。
[clears throat softly]：轻轻清嗓子。

【呼吸与叹气】
[soft sigh]：轻轻叹一口气。
[deep breath]：明显吸一口气，准备开口或稳住情绪。
[sharp gasp]：突然倒吸一口气。
[slight panting]：轻微喘息，例如刚走快了、运动后尚未平复。
[heavy panting]：明显急促喘息，适用于剧烈运动等明确场景。

【哭泣与鼻音声响】
[soft sniffle]：轻轻吸一下鼻子。
[brief sob]：短促哽咽或抽泣一下。
[softly crying]：一小段轻声哭泣。
[crying intensely]：强烈哭泣，适用于剧情明确要求情绪失控。

【其他声音】
[soft groan]：低低哼一声，表达难受、费力或受不了。
[soft moan]：轻微呻吟，按具体场景使用。
[brief yawn]：短短打一个哈欠。

以上两类词表是完整的可选范围。标签原样使用，不自行翻译、改写、添加程度词或拼接新标签。

六、选择与放置方法

情绪标签控制后续台词的说法；声响标签表示某个位置实际发出的声音。

日常台词已经能清楚表达时，可以不加情绪标签。出现明显情绪、隐藏情绪，或容易让 Drama3 自行放大情绪的地方，用带程度的标签约束。

同一种语气连续说几句，只在开始处标一次。中途确实改变说法，再在变化开始的位置换标签。每处只选一个最贴切的情绪标签。

声响按实际需要添加：
- 开心可以只让语气变亮，不必发出笑声。
- 难过可以只带哭意，不必额外抽泣。
- 紧张可以只让声音稍微发紧，不必额外喘息。
- 疲惫可以只让说话没力气，不必额外叹气。
- 咳嗽、喘息、笑声等已有标签表达时，不再重复添加“咳咳”“哈哈哈”等同一声响的拟声文字。

短语音通常零个或一个情绪标签。声响只在场景确实需要听见时添加，不为增加“活人感”安排固定声响。

七、具体情境判断

- 普通开心选择 [slightly happy]，明确激动起来才提高程度。
- 有点不满选择 [slightly annoyed]；很生气但仍压着火，选择 [very angry but controlled]。
- 小心试探对方是否愿意，选择迟疑；确实害怕，才选择恐惧。
- 忍着眼泪把话说完，选择 [voice trembling slightly]；确实抽泣一下，才在发生处插入 [brief sob]。
- 撒娇、委屈、不舍分别选择对应标签。
- 明确拒绝、划清界限选择 [calm but firm]，不要用坚决代替普通不满。
- 低声说话选择 [slightly lowered voice]，真正贴近耳边说话才选择 [quiet whisper]。

八、完整写法示例

日常关心，直接说：
到了跟我说一声。晚一点也没事，路上注意安全。

轻微开心，整段保持同一种语气：
[slightly happy]你回来啦。我给你留了点吃的，还热着呢。

带一点玩笑，中间轻笑一下：
[lightly playful]你不是说一点都不想我吗？[soft chuckle]那怎么还记得我今天几点回来。

轻轻清嗓，认真开口：
[clears throat softly][calm and serious]有件事，我想跟你好好说一下。

轻咳后继续说话：
[light cough]嗯，刚才有点呛到了。你接着说，我听着呢。

刚跑过来，有一点喘：
[slight panting]等一下，让我缓缓。我刚才一路跑过来的。

很生气，吸一口气后压着火说：
[deep breath][very angry but controlled]我现在很生气。你先听我把话说完。

忍着哭，声音微颤，后面吸一下鼻子：
[voice trembling slightly]你先别挂。[soft sniffle]我还想再听一会儿你的声音。

前面正常，转折处露出轻微不满：
晚一点没关系。[slightly annoyed]但你知道我在等，至少也该发条消息吧。

小心试探，保持连贯：
[slightly hesitant]那个，明天我还能去找你吗？你忙的话，改天也行。

示例展示选词、程度和位置。实际台词根据当前角色与场景生成，不照抄示例内容。台词使用其他语言时，英文标签保持不变。

九、输出要求

遵循外层规定的语音包装格式。只包含可朗读台词和必要的固定标签。

给已有台词添加标注时，保留原语言、原词和原标点。

直接输出结果，标签选择理由、场景解释和动作描述不进入朗读文本。`;

/** 死标注版允许的 56 个标签（与上面提示词里的词表逐字一致）。 */
export const FISH_DRAMA3_FIXED_CUES = new Set<string>([
  'slightly happy',
  'quietly delighted',
  'moderately excited',
  'very excited',
  'slightly annoyed',
  'moderately angry',
  'very angry but controlled',
  'very angry, raised voice',
  'slightly sad',
  'moderately sad',
  'deeply sad but composed',
  'voice trembling slightly',
  'quietly tearful',
  'gently affectionate',
  'lightly coaxing',
  'slightly lonely and coaxing',
  'lightly playful',
  'slightly smug',
  'slightly sulky',
  'slightly hesitant',
  'very hesitant but calm',
  'slightly shy',
  'slightly uncertain',
  'slightly nervous',
  'slightly worried',
  'very worried but composed',
  'slightly frightened',
  'very frightened',
  'slightly surprised',
  'very surprised',
  'gently reassuring',
  'slightly lowered voice',
  'quiet whisper',
  'slightly sleepy',
  'slightly tired',
  'calm and serious',
  'calm but firm',
  'soft chuckle',
  'quiet giggle',
  'brief laugh',
  'loud laughter',
  'light cough',
  'coughing',
  'clears throat softly',
  'soft sigh',
  'deep breath',
  'sharp gasp',
  'slight panting',
  'heavy panting',
  'soft sniffle',
  'brief sob',
  'softly crying',
  'crying intensely',
  'soft groan',
  'soft moan',
  'brief yawn',]);

/** 逐字命中表里没有时，按同义词归到最近的那个（模仿旧清洗的映射思路）。 */
const CUE_SYNONYMS: Record<string, string> = {  'happy': 'slightly happy',
  'glad': 'slightly happy',
  'cheerful': 'slightly happy',
  'delighted': 'quietly delighted',
  'joyful': 'quietly delighted',
  'excited': 'moderately excited',
  'eager': 'moderately excited',
  'enthusiastic': 'moderately excited',
  'annoyed': 'slightly annoyed',
  'irritated': 'slightly annoyed',
  'frustrated': 'slightly annoyed',
  'angry': 'moderately angry',
  'mad': 'moderately angry',
  'furious': 'very angry but controlled',
  'sad': 'slightly sad',
  'unhappy': 'slightly sad',
  'disappointed': 'slightly sad',
  'depressed': 'moderately sad',
  'lonely': 'slightly lonely and coaxing',
  'sulking': 'slightly sulky',
  'tearful': 'quietly tearful',
  'crying': 'softly crying',
  'sobbing': 'brief sob',
  'sob': 'brief sob',
  'affectionate': 'gently affectionate',
  'tender': 'gently affectionate',
  'warm': 'gently affectionate',
  'coaxing': 'lightly coaxing',
  'playful': 'lightly playful',
  'teasing': 'lightly playful',
  'smug': 'slightly smug',
  'proud': 'slightly smug',
  'hesitant': 'slightly hesitant',
  'uncertain': 'slightly uncertain',
  'shy': 'slightly shy',
  'nervous': 'slightly nervous',
  'anxious': 'slightly nervous',
  'worried': 'slightly worried',
  'scared': 'slightly frightened',
  'afraid': 'slightly frightened',
  'fearful': 'slightly frightened',
  'surprised': 'slightly surprised',
  'amazed': 'slightly surprised',
  'reassuring': 'gently reassuring',
  'soothing': 'gently reassuring',
  'calm': 'calm and serious',
  'serious': 'calm and serious',
  'firm': 'calm but firm',
  'whisper': 'quiet whisper',
  'whispering': 'quiet whisper',
  'hushed': 'quiet whisper',
  'sleepy': 'slightly sleepy',
  'tired': 'slightly tired',
  'chuckle': 'soft chuckle',
  'chuckles': 'soft chuckle',
  'giggle': 'quiet giggle',
  'giggling': 'quiet giggle',
  'laugh': 'brief laugh',
  'laughs': 'brief laugh',
  'laughing': 'brief laugh',
  'laughter': 'brief laugh',
  'cough': 'light cough',
  'coughs': 'light cough',
  'coughing': 'coughing',
  'clears throat': 'clears throat softly',
  'ahem': 'clears throat softly',
  'sigh': 'soft sigh',
  'sighs': 'soft sigh',
  'sighing': 'soft sigh',
  'breath': 'deep breath',
  'inhale': 'deep breath',
  'gasp': 'sharp gasp',
  'gasps': 'sharp gasp',
  'panting': 'slight panting',
  'pant': 'slight panting',
  'out of breath': 'slight panting',
  'sniffle': 'soft sniffle',
  'sniffles': 'soft sniffle',
  'groan': 'soft groan',
  'groans': 'soft groan',
  'moan': 'soft moan',
  'moans': 'soft moan',
  'yawn': 'brief yawn',
  'yawns': 'brief yawn',
  'lowered voice': 'slightly lowered voice',
  'softly': 'slightly lowered voice',};

/**
 * 强度档位。同一件事有「轻轻」和「很」两档时，模糊匹配**不许跨档**——
 * 旧逻辑把 `[crying quietly]` 匹成 `[crying loudly]`（意思反了），这里专门堵这个洞。
 */
const WEAK_CUES = new Set<string>([
  'slightly happy', 'quietly delighted', 'slightly annoyed', 'slightly sad',
  'voice trembling slightly', 'quietly tearful', 'lightly coaxing',
  'slightly lonely and coaxing', 'lightly playful', 'slightly smug', 'slightly sulky',
  'slightly hesitant', 'slightly shy', 'slightly uncertain', 'slightly nervous',
  'slightly worried', 'slightly frightened', 'slightly surprised',
  'slightly lowered voice', 'slightly sleepy', 'slightly tired',
  'gently affectionate', 'gently reassuring', 'quiet whisper',
]);

const STRONG_CUES = new Set<string>([
  'very excited', 'very angry but controlled', 'very angry, raised voice',
  'deeply sad but composed', 'very hesitant but calm', 'very worried but composed',
  'very frightened', 'very surprised',
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
 * 把任意方括号内容归一到那 56 个固定标签。归不了返回 ''（应整段丢掉）。
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
 * 死标注版不需要这道闸门 —— 那 56 个标签最长 27 字，白名单本身就把长的挡在外面了。
 */
export const MAX_SPOKEN_BRACKET_CHARS = 40;

/**
 * drama-3 专用清洗。两套写法共用的脏东西先清掉，再按写法分叉：
 *   · free  → 方括号原样留下，但超过 MAX_SPOKEN_BRACKET_CHARS 的整段丢掉
 *   · fixed → 方括号归一到那 56 个，归不了的整段丢掉
 *
 * 与旧 cleanTextForTtsFish 相同部分（系统标记、双语分隔、中文舞台指示、MiniMax 停顿、
 * 西文圆括号转方括号）照抄，因为那些是「不该被念出来的脏东西」，与模型无关。
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
