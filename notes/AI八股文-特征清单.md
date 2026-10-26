# AI 八股文特征清单（网上搜来的，给写提示词时对照删）

> 说明：下面每一条都是从真实网页里抄下来的具体词、句式、例子，用来写提示词时对照着删。
> 大部分来源自己都提醒过一句：单看一条不算数，真人也会用；真正露馅的是**同一类东西在短距离内密集出现**（来源：SlopDetector、中文维基百科、搜狐「一眼看穿AI」）。
> 标「（没搜到）」的地方，是这一类没找到靠谱来源，不编。

---

## 一、词汇层面：一眼 AI 的词

### 1.1 中文连接词 / 套话词（见一个删一个）
首先是其次再次最后、综上所述、总的来说、总而言之、说到底、值得注意的是、值得一提的是、不难发现、不可否认、毋庸置疑、可以说、某种程度上、与此相关的是、此外、与此同时、这意味着、本质上、换句话说、由此可见、不得不说、说白了（来源：GitHub `JuneYaooo/xhs-writer-skill` 的 `humanizer-zh.md`、知乎「AI味通缉令」、CSDN「去AI味提示词大全」）。

### 1.2 中文公文腔 / 互联网黑话
赋能、抓手、闭环、底层逻辑、颗粒度、对齐、提质增效、纵深推进、全面部署、多点开花、深度融合、多维度、生态、助力、助推、构建、重塑、助力学术界打造全新跨学科生态闭环（来源：2Dogppt 博客「AI PPT的AI味从哪来」、知乎「AI味通缉令」、GitHub `jiji262/humanizer-chinese` §9）。

### 1.3 夸大重要性 / 升华词（中文维基百科「词表」原文）
稳/稳稳地、接住、作为/服务于、见证/提醒、至关重要/意义重大/关键时刻/转折点/重要时刻、强调/突出其重要性/意义、反映出更广泛的……、标志着其持续/持久地……、做出贡献、奠定基础、标志着/塑造……、代表/标志着转变、不断变化的格局、聚焦点、不可磨灭、根植于……
配套动词：标志着、见证了、是……的体现/证明、为……奠定坚实基础、极其重要、关键转折点（来源：中文维基百科「AI生成文的特徵」、GitHub `humanizer-zh.md`）。

### 1.4 翻译腔动词（把思考说成物理动作）
锋利、击穿、拆解、收口、承担、撑不住、不崩、不爆、打穿、收紧、落地、推开、扛住、接住（来源：yage.ai「写作中的AI味是哪儿来的」）。
还有：分析流于表面用的「标志着/彰显/凸显」（见 1.3）。

### 1.5 英文 AI 高频词（Tier 1，见一个删一个）
delve、delving、utilize、leverage、facilitate、elucidate、embark、endeavor、encompass、multifaceted、tapestry、testament、paradigm、synergy、holistic、catalyze、juxtapose、realm、myriad、plethora、underscore、galvanize、epitomize、unravel、supercharge、spearhead、catapult、conceptualize（来源：SlopDetector「The AI Words List: 120+ Phrases ChatGPT Overuses」）。
中文翻译版高频词：持久的、格局、关键性的、展示、织锦、彰显了、增强、培养、至关重要、深入探讨、宝贵的、充满活力的（来源：`humanizer-zh.md`）。

### 1.6 英文 AI 高频词（Tier 2，成堆出现才可疑）
robust、comprehensive、seamless、cutting-edge、innovative、streamline、empower、foster、enhance、elevate、optimize、scalable、pivotal、intricate、profound、resonate、harness、navigate、cultivate、bolster、cornerstone、game-changer、groundbreaking、transformative、unprecedented、compelling、ever-evolving、meticulous、versatile、bespoke、unwavering、vibrant、unleash、unlock、unveil、craft、hone、tailor、captivate、revolutionize、amplify、illuminate、discern（来源：同上 SlopDetector）。

### 1.7 英文 AI 高频词（Tier 3，普通词，密度高才可疑）
crucial、essential、vital、significant、remarkable、exceptional、furthermore、moreover、additionally、consequently、nevertheless、ultimately、arguably、indeed、notably、paramount、pragmatic、foundational、strategic（来源：同上 SlopDetector）。

### 1.8 英文夸大 / 宣传词（维基百科英文版词表原文）
stands/serves as、is a testament/reminder、a crucial/pivotal/vital/significant/key role/moment、underscores/highlights its importance/significance、reflects broader、symbolizing its ongoing/enduring/lasting、contributing to the、setting the stage for、marking/shaping the、represents/marks a shift、key turning point、evolving landscape、focal point、indelible mark、deeply rooted；
宣传腔：boasts a、vibrant、rich、profound、enhancing、showcasing、exemplifies、commitment to、natural beauty、nestled、in the heart of、groundbreaking、renowned、featuring、diverse array（来源：英文维基百科「Signs of AI writing」）。

### 1.9 英文模糊归因词
experts agree、studies have shown、research suggests、observers noted、the data speaks for itself（来源：SlopDetector）。
中文对应：专家认为、研究表明、观察者指出、行业报告显示、相关数据证明、大量实践证明（来源：`humanizer-zh.md`、搜狐「一眼看穿AI」）。

### 1.10 OpenAI 列出的禁词（中文媒体转述）
delve、leverage、it's worth noting、不是A而是B（来源：搜索到的报道《OpenAI官方首次列出AI味禁詞清單》，原文页 bannedbook.org 打不开，只从搜索结果摘要取到这四个，页面内容未核）。

### 1.11 宏大词（中文高考作文实测高频）
智慧、时代、人生、力量、成就（来源：虎嗅 / RUC新闻坊「AI味到底是什么味儿」）。

> 这些不是全部。

---

## 二、句式层面：一眼 AI 的句式

### 2.1 二分否定强调（最经典）
- 不是……而是……
- 不仅是……更是…… / 不仅……而且…… / 不仅……还……
- 不只是……而是…… / 这不仅仅是一次……而是……
- 与其说……不如说……
（来源：中文维基百科「否定平行結構」、英文维基百科「Negative parallelisms」、`humanizer-zh.md`、SlopDetector「It's not X, it's Y」）
例子（来源：搜狐「一眼看穿AI」）：「不是简单的文本还原，而是深层的意义重构；不是被动的知识接受，而是主动的思想对话；不是孤立的个案分析，而是整体的文明审视。」——三句说的是同一件事。

### 2.2 序号八股
首先……其次……再次……最后……；第一……第二……第三……；一是……二是……三是……
（来源：`humanizer-zh.md`、千问「去AI味润笔师」）

### 2.3 万能开头
- 随着……的发展 / 随着科技的飞速发展 / 随着人工智能的不断发展
- 在当今社会 / 在这个充满变革的时代 / 在当今数字时代 / 在这个信息爆炸的时代
- 在这个快节奏的时代
- 近年来，……已成为各界关注的焦点
- 众所周知
- 让我们一起来探讨 / 让我们深入了解一下
（来源：`humanizer-zh.md`、马良写作、Mason AI Lab、SlopDetector「In today's fast-paced world」）

### 2.4 长句组装框架
通过……来……；通过……对……进行……；运用……实现……；在……的背景下；随着……的推进；使……得以……；让……更加……
（来源：`humanizer-zh.md` §23「长句堆砌」、2Dogppt）

### 2.5 抽象名词做主语 + 形容词收尾
「X 的 Y 比 Z 更 W」骨架。例子：「工程上的现实比这些数字难看。」（来源：yage.ai「写作中的AI味是哪儿来的」）

### 2.6 形容词先下判断 + 冒号引内容
「逻辑很清晰：」「问题很直接：」「结论很明确：」「原因很简单：」「更锋利的重构：」「验证得更干净：」（来源：同上 yage.ai）

### 2.7 句尾升华小句（-ing 式）
……，彰显了……；……，体现了……；……，象征着……；……，凸显了……；……，反映出更广泛的……；……，为……奠定基础（来源：英文/中文维基百科、`humanizer-zh.md` §3）
例子：「设计采用蓝色和绿色，象征着人与自然的深厚联系，彰显了品牌的核心价值。」

### 2.8 万能动词公文腔
对……进行分析（→分析了）、作出调整（→调整）、进行讨论（→讨论）、实现提升、达成协同、促进发展、基于以上分析可以得出以下结论（来源：`humanizer-chinese` §17、Mason AI Lab）

### 2.9 伪跨度 / 伪穷举
「从X到Y」（两端没有实际意义）、「包括A、B、C等」、「三个层面：一是……；二是……；三是……」（来源：`humanizer-zh.md` §9「虚假范围」、搜狐「一眼看穿AI」）

### 2.10 模糊归因句式
「大量实践证明」「相关研究也表明」「某研究表明」「据……显示」「专家指出」——不给具体出处（来源：搜狐「一眼看穿AI」、SlopDetector）

### 2.11 总结 / 收尾句式
综上所述、总而言之、由此可见、总的来说、说到底、总之、未来可期、让我们共同期待、拭目以待、未来充满无限可能（来源：千问「去AI味润笔师」、`humanizer-zh.md`）

### 2.12 英文万能句式
- "It's not X, it's Y" / "A is not about, it's about B"
- "In today's fast-paced world" / "In today's digital age" / "In a world where"
- "Let's dive into" / "Let's explore"
- "When it comes to"
- "Picture this" / "Ever wondered"
- "Here's the thing" / "Here's the deal"
- "The result?" / "The answer?" / "And the best part?"
- "The key is to find balance"
- "At the end of the day"
- "is defined as" / "refers to the process of" / "plays an important role in" / "can be broadly categorized into"
- "move the needle" / "low-hanging fruit" / "best practices" / "take it to the next level" / "the possibilities are endless"
（来源：SlopDetector）

> 这些不是全部。

---

## 三、结构层面：一眼 AI 的结构

1. **总分总**：开头提出、中间展开、结尾再念一遍。每段都是「观点 + 解释 + 例子 + 总结」的踩格子写法（来源：马良写作、wenxuecity 转述 OpenAI 清单、`humanizer-zh.md`）。
2. **三段式 / 三连排比**：不管内容够不够，先凑三点。「创新、灵感和行业洞察」「勇敢的战士，是忠诚的朋友，更是坚定的信仰者」（来源：`humanizer-zh.md` §7、马良写作、千问「去AI味润笔师」§1、§10「数字凑排比：三个关键/四大维度/五大法宝」）。
3. **每段开头第一句都是中心句**，段落首句高度同质：「从更深层次来看……」「值得进一步思考的是……」（来源：搜狐「一眼看穿AI」）。
4. **结尾必升华**：不管写什么事，段尾都要拔到人生、时代、未来（来源：千问「去AI味润笔师」§9、CSDN「AI写作去AI味」）。
5. **「挑战与展望」固定章节**：以「尽管……有其意义，但其面临的挑战有……」开头，以正面展望结尾（来源：中文维基百科「過於簡略的前景」、`humanizer-chinese` §7）。
6. **小标题过度包装 / 内联标题列表**：「**标题：** 内容。**标题：** 内容。」或「破局之道：双轮驱动」这类三级编号（来源：`humanizer-chinese` §21、`humanizer-zh.md` §12）。
7. **编号段落**：人类可以写成散文的地方，AI 拆成 1. 2. 3. 带编号的小段（来源：中文维基百科「不成節且賦編號的段落」）。
8. **整体不推进**：第二段换说法重复第一段；把段落顺序打乱读起来几乎没违和感（来源：搜狐「一眼看穿AI」的「打乱测试」）。
9. **信息均匀**：每段等长、每点等句数，像用尺量过（来源：Mason AI Lab「對稱到不自然的排比」、搜狐「句子长度太均匀」）。
10. **列表式行文**：`• **标题：** 内容` 格式，或直接拿表情符号当列表标记（来源：中文维基百科「列表式行文」「表情符號」）。
11. **公式化开篇锚点**：同一道题，7 个 AI 模型开头几乎一模一样（都以「藏锋以包其气，露锋以纵其神」开篇）（来源：虎嗅 / RUC新闻坊）。

> 这些不是全部。

---

## 四、语气层面：一眼 AI 的语气

这一类两边都假，都要删。

### 4.1 一边：无意义语气词 / 口头禅堆砌（假装有人味的反面翻车）
统一假口语腔、堆口头禅、故意加错别字，被明确列为「装人味是新的 AI 味」（来源：`humanizer-chinese`「防过度纠偏」）。
网上提到的这类口头禅/语气词：嗯、呢、啊、吧、啦、嘛、哈、唉、哎、就是、反正、其实、说真的、怎么说呢（来源：`humanizer-zh.md`「推荐口语化词组」反着用、`humanizer-chinese` 防过度纠偏清单）。
> 「这个/那个」这种具体填充词，没搜到单独点名的靠谱来源（没搜到）。

### 4.2 另一边：假装口语 / 假装亲切（一眼假）
- 其实吧、说白了、说实话、你没看错、不夸张地说（来源：`humanizer-chinese` §25「假坦诚开场钩子」、`humanizer-zh.md`）
- 家人们、宝子们、姐妹们、懂的都懂、咱就是说（来源：juejin 小红书提示词、小红书文案相关文章）
- 硬塞网络热梗：yyds、绝绝子、狠狠夸、超绝（来源：juejin「让AI写出小红书爆款」）

### 4.3 假互动 / 引流结尾
「你觉得呢？点赞关注~」「你觉得呢？评论区聊聊」（来源：`humanizer-chinese` §35）

### 4.4 谄媚语气 / 助手残留
「好问题！」「你说得完全正确！」「这是一个非常好的问题！」「希望以上分析对您有所帮助！如需进一步探讨，请随时告知。」「当然！让我来……」（来源：`humanizer-zh.md` §14、§15、SlopDetector）

### 4.5 骑墙不表态
「各有利弊，见仁见智」「需视个人需求与实际情况而定」「因人而异」（来源：`humanizer-chinese` §36、Mason AI Lab 特征四）

### 4.6 说教腔
直接点明主题：「这个故事告诉我们……」「AI 故事里出现哲学讨论的比例 59%，人类 34%」（来源：投资界 / 钛媒体「AI写小说的套路被扒光了」，引 StoryScope 论文）

### 4.7 过度对冲 / 限定词叠罗汉
「或许可能在一定程度上对结果产生一些影响」（来源：`humanizer-zh.md` §16）

### 4.8 万能积极结尾 / 宏大语气
「未来充满无限可能，让我们共同期待激动人心的时代到来。」（来源：`humanizer-zh.md` §17）

> 这些不是全部。

---

## 五、描写层面：一眼 AI 的描写

### 5.1 用身体反应和身体隐喻代替情绪（AI 最狠的一条）
数据：81% 的 AI 会用生理感受/身体隐喻传达情绪，人类只有 38%（来源：投资界 / 钛媒体，引马里兰大学 + Google DeepMind《StoryScope》论文）。
具体写法：胸口发紧、冷汗顺着脊背滑落、喉咙发干、胃里一沉、手指发抖、呼吸一滞。
完整例子（来源同上）：「他感到胸口发紧，冷汗顺着脊背滑落，周围的灯光似乎暗了下来。空气中弥漫着一种说不清的气息，像雨后的泥土，又像某种古老的记忆。」

### 5.2 嗅觉意象滥用
AI 用嗅觉意象的比例 82%，人类 57%（来源同上）。「空气中弥漫着……的气息」是典型。

### 5.3 用环境映射内心
灯光暗下来、风起了、天色阴沉，用来暗示角色心情（来源同上，「把环境设定作为角色内心状态的映射」）。

### 5.4 情绪直给（贴标签）
「她感到一阵深深的悲伤涌上心头。」——直接说情绪名词，不用动作细节（来源：马良写作特征四）。
（注意：这一条和 5.1 是两个极端，AI 两边都会犯：要么直接贴标签，要么堆一堆身体反应「演」情绪。）

### 5.5 比喻滥用 / 陈词比喻
镜子、纽带、种子这类换任何主题都能用的老套比喻；把钢笔写字的声音比作婴儿初啼；把信任比作鞋底反复拉扯的口香糖（来源：搜狐「一眼看穿AI」、虎嗅 / RUC新闻坊）。
英文社区的说法：purple prose（过度华丽的散文）是 AI 的常见毛病（来源：Authors A.I.、Jericho Writers 等）。

### 5.6 堆砌无意义的数值 / 伪具体
给出看似精确的引文、卷次、数字，但查不到来源。例子：「据《四库全书总目提要》卷一三七所载，该书共有宋刻本三种、元刻本两种，其中南宋绍兴年间刊本被认为最善。」——格式权威，内容虚构（来源：搜狐「一眼看穿AI」的「细节造假 / 伪具体化」）。

### 5.7 动作分解成一格一格
把连续动作拆成慢镜头逐格描写（来源：搜索结果与 `humanizer-zh.md` 提到 AI 爱堆砌动作细节；具体「一格一格」的中文原文表述没搜到单独出处（没搜到，只搜到「堆砌动作描写」这个方向）。

### 5.8 形容词代替事实
「显著提升」「大幅改善」「有效优化」「成效卓越」——读完不知道到底发生了什么（来源：Mason AI Lab 特征三、2Dogppt、`humanizer-zh.md`）

> 这些不是全部。

---

## 六、中文特有的毛病

### 6.1 翻译腔（四种套路，来源：yage.ai「写作中的AI味是哪儿来的」）
1. **用物理动作描述思考过程**：接住、击穿、拆解、锋利、不崩、撑不住、claim 更硬（把英文的 catch/sharp/break/hold 直译过来）。
2. **用形容词替读者先下判断 + 冒号**：「逻辑很清晰：」「更锋利的重构：」（原型是英文 "Quite simply, …"）。
3. **用抽象名词做主语、形容词当结论**：「X 的 Y 比 Z 更 W」，例「工程上的现实比这些数字难看。」
4. **有中文译法却直接混英文词**：context、state、cache、claim（都有稳定中文：上下文、状态、缓存、断言）。

### 6.2 被字句滥用（欧化被动）
「这一步会做得非常自然」「这个过程会被顺利地完成」「该问题可以被有效地解决」「将被自动保存」（来源：知乎「为什么很多AI中文总有翻译腔」、`humanizer-chinese` §16）

### 6.3 的的的（多个「的」堆叠、的地得乱用）
中文特有高频问题，`humanizer-chinese` 把它归在「欧化翻译腔 / 均质书面腔」里（来源：`humanizer-chinese` §16、§19；单独的「的的的」词条原文没搜到（没搜到））。

### 6.4 四字词堆砌
提质增效、纵深推进、全面部署、多点开花——一页里塞三四个，像公文词大集合（来源：2Dogppt）

### 6.5 万能动词公文腔
进行、实现、达成、促进、构建、推动、对……进行分析、作出调整（来源：`humanizer-chinese` §17，引余光中《怎样改进英式中文》）

### 6.6 全角半角混用
「每组50人, 差异显著.」——中文里夹半角标点（来源：`humanizer-chinese` §31）

### 6.7 引号强调癖
给「努力」「坚持」加引号当强调（来源：`humanizer-chinese` §28）

### 6.8 欧化长句
一句话超过 30 字，含多个「通过/对/进行/实现」（来源：`humanizer-zh.md` §23）

### 6.9 宏大词 / 抽象词
智慧、时代、人生、力量、成就（来源：虎嗅 / RUC新闻坊）

### 6.10 互联网黑话
赋能、抓手、闭环、底层逻辑（来源：`humanizer-chinese` §9）

> 这些不是全部。

---

## 七、怎么反着写才像人（正面写法，最重要的一节）

### 7.1 句子节奏
- 长短句交错：短句之后跟长句（来源：`humanizer-zh.md` 核心原则 3）。
- 穿插只有几个字的超短句，独立成段：「他懂了。」「来不及了。」「算了。」（来源：马良写作方法二、`humanizer-zh.md` §句式断裂）。
- 写完一段，把最长的句子拆成 3–4 个短句；或把几个短句合成一个有节奏感的长句（来源：马良写作方法二）。
- 每句尽量控制在 20 字以内，用句号切断，不用逗号连接三层意思（来源：`humanizer-zh.md` §23）。

### 7.2 具体压倒抽象
- 形容词换事实：「大幅提升出货效率」→「原本两个人一天排三十张单，现在一个人一天排五十张」（来源：Mason AI Lab）。
- 判断套话的办法：句子后面能不能加「比如」并说出具体数字/事件/人物；加不出来就是套话（来源：2Dogppt）。
- 专业术语后面紧跟具体例子（来源：`humanizer-zh.md` §23）。

### 7.3 加入只有你知道的东西
第一手细节、你踩过的坑、客户问过的怪问题、真实流程（来源：Mason AI Lab「加入只有你知道的东西」、`humanizer-zh.md` §加入私货）。
例子：AI 写「实验结果表明模型精度显著提升」；人写「跑完第三次实验，精度从80%飙到92%，我当时就拍了桌子，这数据稳了。」

### 7.4 敢下结论、有立场
不要把结论停在「因人而异」「各有优缺点」。可以保留但书，可以写「我知道有人不同意」（来源：Mason AI Lab「敢下结论」、`humanizer-chinese` §36）。

### 7.5 情绪体感化，不总结情绪
AI 写「我感到非常震撼」；人写「我当时就愣住了」——写那个时刻真实发生的身体反应（来源：`humanizer-zh.md` §让情绪体感化）。
反面例子（要删）：直接用「悲伤」这种标签（来源：马良写作特征四）。

### 7.6 论述中故意打断
展开观点时故意加口语中断，破坏严谨感。例子：「没有什么特定的理由，就是心血来潮，就是单纯的，想看看现在的生态。」（来源：`humanizer-zh.md` §论述中故意打断）

### 7.7 承认对立面
讲观点前先站到读者角度把处境讲透，再转入自己的观点（来源：`humanizer-zh.md` §承认对立面）。

### 7.8 打破结构
- 删掉第一句、甚至第一段（AI 的开场几乎都是废话）（来源：Mason AI Lab「第一句砍掉重写」）。
- 打散总分总；叙事段落可以从一个画面切入、跳到回忆、再切回现实，中间不做过渡（来源：马良写作特征七）。
- 不是分条目的内容就去掉小标题，用口语化转场句衔接：「说到这……」「回到上面那个问题……」「顺着这个再说说……」（来源：`humanizer-zh.md` §13）。

### 7.9 信任读者，不解释、不软化
直接陈述，不手把手引导，不辩解（来源：`humanizer-zh.md` 核心原则 4）。

### 7.10 删金句
听起来像可以被引用、能当语录的句子，基本是 AI 写的，重写（来源：`humanizer-zh.md` 核心原则 5）。

### 7.11 该重复就重复
不要为了「避免重复」轮换同义词（主人公/主角/核心人物），该用同一个词就用同一个（来源：`humanizer-chinese` §14）。

### 7.12 少用连接词
句子之间的逻辑靠上下文暗示，不需要每句都标明「我要转折了」（来源：马良写作特征二、`humanizer-zh.md`）。

### 7.13 对话去书面化
- 加口语词：「行」「得了」「不至于」「那啥」（来源：马良写作方法三）。
- 加语气词：「啊」「嘛」「呢」「吧」——但要贴角色，不要通篇堆。
- 让角色说半句话：「如果你当时不——算了，不说了。」
- 检验标准：你身边有人会这么说话吗？不会就改。
例子：AI「我表示同意你的方案。但请注意，如果出现问题，责任由你来承担。」→ 人「行吧，你说了算。不过这事你兜着，出了岔子别往我身上赖。」

### 7.14 丰富感官细节
AI 很少写气味、触感、声音的微妙变化。例子：「天气很冷」→「鼻尖冻得发痒，呼出的白气还没散就被风吹碎了。」（来源：马良写作方法四）

### 7.15 允许「闲笔」
允许不推进剧情/信息、只为让世界有呼吸的描写（来源：马良写作方法五）。

### 7.16 结尾处理
结尾收在一个具体画面、或一个开放的问题上，不升华、不总结（来源：千问「去AI味润笔师」§3）。

### 7.17 口语化转场词（可直接用）
坦率的讲、说真的、反正我觉得、怎么说呢、你想想看、我跟你说、顺着上面的再聊聊（转场）；我有时候觉得、我一直觉得、我自己的感受是（表达判断）；说实话我也不确定、我自己也还在摸索（承认不确定）（来源：`humanizer-zh.md` §推荐口语化词组）。

### 7.18 用朴素系动词
用「是/有」代替「作为……坐拥……扮演着……角色」（来源：`humanizer-chinese` §13）。

### 7.19 让人、动作、具体对象做主语
主语从「现实」换成「数字」「各家」，谓语从「难看」换成具体动作「对不齐」（来源：yage.ai）。

### 7.20 最便宜的检验法：念出来
从头念一遍，念到卡住、换气不顺、自己都觉得肉麻的地方，就是不像人说话的地方（来源：Mason AI Lab「念出来」）。

### 7.21 重要提醒：别装人味
统一假口语腔、故意加错别字、堆口头禅，是「装人味」，比 AI 味更尴尬（来源：`humanizer-chinese`「防过度纠偏」）。
也不要为了躲检测而故意把文字写坏（塞错字、硬换冷僻词、乱改句长）（来源：Mason AI Lab）。

> 这些不是全部。

---

## 八、参考来源

1. 搜狐「一眼看穿AI：AI中文写作的常见特征」— https://www.sohu.com/a/1014931596_523187
2. 中文维基百科「Wikipedia:AI生成文的特徵」— https://zh.wikipedia.org/wiki/Wikipedia:AI%E7%94%9F%E6%88%90%E6%96%87%E7%9A%84%E7%89%B9%E5%BE%B5
3. 英文维基百科「Wikipedia:Signs of AI writing」— https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
4. 马良写作「从"AI味"到"人味"：你的文字为什么一眼就像AI写的，以及怎么改」— https://maliangwriter.com/blog/reduce-ai-detection-web-novel-guide/
5. GitHub `JuneYaooo/xhs-writer-skill` 的 `references/humanizer-zh.md`「Humanizer-zh: 去除 AI 写作痕迹」— https://github.com/JuneYaooo/xhs-writer-skill/blob/main/references/humanizer-zh.md
6. GitHub `jiji262/humanizer-chinese`「去除中文文本中的AI味（36条中文AI写作模式）」— https://github.com/jiji262/humanizer-chinese
7. SlopDetector「The AI Words List: 120+ Phrases ChatGPT Overuses」— https://slopdetector.org/blog/ai-words-list
8. yage.ai（鸭哥）「写作中的AI味是哪儿来的」— https://yage.ai/share/ai-chinese-translationese-20260418.html
9. Mason AI Lab「「AI 味」是怎麼來的？用 AI 寫東西不被一眼看穿的五個改稿原則」— https://masonailab.com/learn/ai-writing-style/
10. 2Dogppt「AI PPT的"AI味"从哪来——6种典型表现和对应的修改方法」— https://www.2dogppt.com/blog/ai-ppt-flavor-six-issues-fixes
11. 虎嗅 / RUC新闻坊「"AI味"到底是什么味儿？」— https://m.huxiu.com/article/4784376.html
12. 投资界（转钛媒体）「AI写小说的套路被扒光了」（引马里兰大学 + Google DeepMind《StoryScope》论文）— https://news.pedaily.cn/202606/564685.shtml
13. 千问 AI 平台「去AI味润笔师」— https://www.qianwenai.com/hub/skills/@user_21z1v/de-ai-writer
14. 知乎「「AI味」到底是什么味儿？——AI味通缉令」— https://zhuanlan.zhihu.com/p/2064372115588100977
15. CSDN「去AI味提示词大全：25个实用Prompt帮你降低AI率」— https://blog.csdn.net/aigccleaner/article/details/158099796
16. CSDN「AI写作去AI味：10种提升内容独特性的实用技巧」— https://bbs.csdn.net/weixin_33046983/article/details/100201717
17. 什么值得买「AI写作同质化困局：三类提示词停用指南与反套路实战」— https://post.smzdm.com/p/a5r7x4n7/
18. 知乎「为什么很多AI 中文总有"翻译腔"？一个简单提示词」— https://zhuanlan.zhihu.com/p/2021303797780071106
19. Threads「去除文章ai味的prompt」— https://www.threads.com/@_3cpj_/post/DScx6_3jz1f/
20. juejin「一篇文章教会你如何用优质的Prompt，让AI写出小红书爆款」— https://juejin.cn/post/7525320525075415081

> 说明：第 8 条（bannedbook.org 转 OpenAI 禁词清单）原文页打不开，只从搜索结果摘要取到 delve、leverage、it's worth noting、不是A而是B 四个，未核全文。
