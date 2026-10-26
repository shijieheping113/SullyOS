/**
 * 陪看解析层：模型写歪了也得接住。
 *
 * 这批用例全部来自「模型真的会这么写」的样本——带序号、带星号、
 * 裹代码块、只写一段话、昵称里带冒号，全都要能认出来。
 */
import { describe, expect, it } from 'vitest';
import { __parseChar, __parseRooms, __parseStage } from './engine';

describe('台上这一幕的解析', () => {
  it('标准写法', () => {
    const r = __parseStage(`画面：老陈把烙铁放回架子上，吹了下手指。
台词：这管子比我岁数还大，烫一下认个亲。
公屏：夜班司机：老陈你别吹了，我刚以为要起火
公屏：豆子：认亲笑死
高能：是`);
    expect(r.scene).toContain('烙铁');
    expect(r.speech).toContain('认个亲');
    expect(r.danmaku).toHaveLength(2);
    expect(r.danmaku[0]).toEqual({ id: expect.any(String), author: '夜班司机', text: '老陈你别吹了，我刚以为要起火' });
    expect(r.hot).toBe(true);
  });

  it('带序号、星号、代码块也能认', () => {
    const r = __parseStage('```\n1. **画面**：镜头推到一锅冒烟的粥。\n2. 台词：糊了糊了。\n```');
    expect(r.scene).toContain('冒烟的粥');
    expect(r.speech).toContain('糊了糊了');
  });

  it('弹幕用竖线隔开也认', () => {
    const r = __parseStage('画面：他把猫抱起来。\n台词：你踩我键盘。\n公屏：路人甲｜猫比你会播');
    expect(r.danmaku[0].author).toBe('路人甲');
    expect(r.danmaku[0].text).toBe('猫比你会播');
  });

  it('完全没按格式写：整段当画面，不让主播念旁白', () => {
    const r = __parseStage('他把手在裤子上擦了擦，说这台机器今天不听话。');
    expect(r.scene).toContain('擦');
    expect(r.speech).toBe('');
    expect(r.danmaku).toHaveLength(0);
  });

  it('整段里带引号：引号内当台词，引号外当画面', () => {
    const r = __parseStage('他凑近主机听了一下，说「这台是不是风扇卡住了」，然后又敲了两下外壳。');
    expect(r.seq.map(s => s.kind)).toEqual(['scene', 'line', 'scene']);
    expect(r.speech).toContain('风扇卡住');
    expect(r.scene).toContain('凑近主机');
  });

  it('挤成一整行：行内标签要能切开，弹幕不许丢', () => {
    // 2026-10-26 真实故障：模型把整段写在一行里，屏幕上只显示半截、弹幕一条都没有
    const r = __parseStage(
      '画：伸手拨了一下头发 话：今天还是老样子 弹幕：小明：哈哈哈哈；阿七：这也行 点名：是',
    );
    expect(r.seq.map(s => s.kind)).toEqual(['scene', 'line']);
    expect(r.seq[0].text).toContain('拨了一下头发');
    expect(r.seq[1].text).toContain('老样子');
    expect(r.danmaku).toHaveLength(2);
    expect(r.danmaku[0].author).toBe('小明');
    expect(r.hot).toBe(true);
  });

  it('弹幕写在标签下一行：要吸上来，不能整批丢', () => {
    const r = __parseStage(`画：锅里油热了
话：下锅下锅
弹幕：
小明：哈哈哈哈
阿七：这也行
点名：否`);
    expect(r.danmaku).toHaveLength(2);
    expect(r.danmaku.map(d => d.author)).toEqual(['小明', '阿七']);
    // 画和话还在，不能被弹幕吞掉
    expect(r.seq.map(s => s.kind)).toEqual(['scene', 'line']);
  });

  it('昵称认不准：宁可记成路人，也不许把前半句当昵称吃掉', () => {
    const r = __parseStage('画：他敲了敲外壳\n话：应该没事\n弹幕：他刚才那句真的绝了：哈哈哈哈哈');
    expect(r.danmaku[0].author).toBe('路人');
    expect(r.danmaku[0].text).toContain('真的绝了');
    expect(r.danmaku[0].text).toContain('哈哈');
  });

  it('一条太长：按句切开，拼回去一个字都不丢', () => {
    const body =
      '他把整箱零件倒在地上一件件分开，先按大小摆成一排，再把有锈的挑出来放右边，剩下的挨个用布擦干净。' +
      '旁边那台老机器已经拆到只剩骨架，螺丝按顺序摆在纸片上，一颗都没有混。' +
      '他说这台得慢慢来，急不得，急一次就要重新排一遍，一晚上就过去了。';
    const r = __parseStage(`画：${body}`);
    expect(r.seq.length).toBeGreaterThan(1);
    for (const s of r.seq) expect(s.text.length).toBeLessThanOrEqual(80);
    // 切开之后拼回来必须还是原来那段话（只允许丢空白）
    expect(r.seq.map(s => s.text).join('').replace(/\s/g, '')).toBe(body.replace(/\s/g, ''));
  });

  it('塌成一整段又没有弹幕：就地切碎收下，绝不偷偷再问一遍（一次调用就是一次钱）', () => {
    const junk = '画：' + '他把镜头挪了挪又挪了挪。'.repeat(24);
    const r = __parseStage(junk);
    expect(r.seq.length).toBeGreaterThan(1);
    expect(r.seq.every(s => s.text.length <= 80)).toBe(true);
    expect(r.danmaku).toHaveLength(0);
  });

  it('画和话交替：按先后收成一串，屏幕上一条一条放', () => {
    const r = __parseStage(`画：他把手机往支架上一夹，人往后靠
话：来了来了，今天还是这台。
画：他翻过后盖，指着一个角
话：你们看这个角，摔过。
弹幕：啃瓜群众：我这个也摔过
话：对对对，没声。你这个也是？
点名：否`);
    expect(r.seq.map(s => s.kind)).toEqual(['scene', 'line', 'scene', 'line', 'line']);
    expect(r.seq[0].text).toContain('支架');
    expect(r.seq[1].text).toContain('来了来了');
    expect(r.seq[4].text).toContain('你这个也是');
    expect(r.danmaku).toHaveLength(1);
    expect(r.hot).toBe(false);
    // 合并出来的 scene / speech 仍要完整，后台摘要和角色材料读的是这两个
    expect(r.scene).toContain('支架');
    expect(r.scene).toContain('后盖');
    expect(r.speech).toContain('来了来了');
    expect(r.speech).toContain('你这个也是');
  });

  it('老写法（一整块画面 + 一整块台词）读成两条，不会坏', () => {
    const r = __parseStage('画面：镜头里一锅冒烟的粥。\n台词：糊了糊了。');
    expect(r.seq).toHaveLength(2);
    expect(r.seq[0].kind).toBe('scene');
    expect(r.seq[0].text).toContain('粥');
    expect(r.seq[1].kind).toBe('line');
    expect(r.seq[1].text).toContain('糊了');
  });
});

describe('角色这一轮的解析', () => {
  it('私聊多行 + 公屏 + 转账', () => {
    const r = __parseChar(`私聊：这主播手上的活儿是假的
私聊：别给他打赏了
公屏：这修法我奶奶都会
转账：收`);
    expect(r.chat).toHaveLength(2);
    expect(r.chat[0].text).toContain('活儿是假的');
    expect(r.public[0]).toMatchObject({ kind: 'danmaku', text: '这修法我奶奶都会' });
    expect(r.transfer).toBe('accept');
    expect(r.wentPublic).toBe(true);
  });

  it('只发一个表情', () => {
    const r = __parseChar('表情：「翻白眼」');
    expect(r.chat).toHaveLength(1);
    expect(r.chat[0].sticker).toBe('翻白眼');
    expect(r.chat[0].text).toBe('');
  });

  it('上麦、麦上说话、打赏', () => {
    const r = __parseChar('上麦：\n麦上：老陈，这管子接线反了\n打赏：小火星 3');
    const kinds = r.public.map(p => p.kind);
    expect(kinds).toContain('mic_on');
    expect(kinds).toContain('mic_line');
    expect(kinds).toContain('gift');
    const gift = r.public.find(p => p.kind === 'gift');
    expect(gift).toMatchObject({ giftName: '小火星', giftAmount: 3 });
  });

  it('安静看：一个泡都不冒，但不算失败', () => {
    const r = __parseChar('安静：这幕没什么好说的');
    expect(r.chat).toHaveLength(0);
    expect(r.public).toHaveLength(0);
    expect(r.wentPublic).toBe(false);
  });

  it('一句标签都没有：抛错，让上层重问一遍', () => {
    expect(() => __parseChar('嗯……这段我没看明白。')).toThrow();
  });

  it('模型还照老习惯写 JSON：能捡回来', () => {
    const r = __parseChar('{"chat":[{"text":"这主播有点意思"}],"public":[],"transfer":"return"}');
    expect(r.chat[0].text).toBe('这主播有点意思');
    expect(r.transfer).toBe('return');
  });

  it('空 JSON：不报错，就是什么都没说', () => {
    const r = __parseChar('{"chat":[]}');
    expect(r.chat).toHaveLength(0);
    expect(r.public).toHaveLength(0);
  });
});

describe('大厅刷台的解析', () => {
  it('一行一个房间', () => {
    const rooms = __parseRooms(`老陈修收音机 | @laochen | 手工 | 凌晨三点修一台收音机 | 手上很稳，说话慢 | 1840 | 慢手 | #1b2430 #3a2a44
1. 豆子打游戏 | @douzi | 游戏 | 手残挑战第 90 天 | 越菜越爱玩，卡关会自言自语 | 2.3万 | 手残 | #12232b #20404a`);
    expect(rooms).toHaveLength(2);
    expect(rooms[0].streamerName).toBe('老陈修收音机');
    expect(rooms[0].coverGradient).toBe('#1b2430,#3a2a44');
    expect(rooms[1].viewerCount).toBe(23000);
  });

  it('回成 JSON 也能捡回来', () => {
    const rooms = __parseRooms(
      '{"rooms":[{"streamerName":"阿朱","title":"织毛衣","category":"手工","viewerCount":30}]}',
    );
    expect(rooms[0].streamerName).toBe('阿朱');
    expect(rooms[0].viewerCount).toBe(30);
  });

  it('什么都没认出来就抛错（界面会提示换一批）', () => {
    expect(() => __parseRooms('今天想不出来。')).toThrow();
  });
});
