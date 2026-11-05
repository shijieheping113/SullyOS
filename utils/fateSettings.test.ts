// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultFateSettings, loadFateSettings, saveFateSettings, type FateSettings } from './fateSettings';

const OLD_PLEASURE = {
    id: 'pleasure',
    name: '玩乐与兴致',
    meaning: '关注兴趣、享受、好奇、欲望与临时起意，让角色拥有自己的兴致。',
};

const withPleasure = (patch: (settings: FateSettings) => FateSettings) => patch(defaultFateSettings());

describe('欲望与本能替换玩乐与兴致', () => {
    beforeEach(() => localStorage.clear());

    it('默认六尊神里，编号 pleasure 换成欲望与本能，词库覆盖食欲性欲爱欲', () => {
        const tendencies = defaultFateSettings().tendencies;
        expect(tendencies).toHaveLength(6);
        const desire = tendencies.find(item => item.id === 'pleasure')!;
        expect(desire.name).toBe('欲望与本能');
        expect(desire.meaning).toContain('食欲');
        expect(desire.meaning).toContain('性欲');
        expect(desire.meaning).toContain('爱欲');
        expect(desire.meaning).toContain('玩乐');
        expect(desire.meaning).toContain('这些只是部分可能');
    });

    it('已保存的原版玩乐与兴致，读取时换成新的名字和含义', () => {
        saveFateSettings('c1', withPleasure(settings => ({
            ...settings,
            tendencies: settings.tendencies.map(item => item.id === 'pleasure' ? { ...OLD_PLEASURE } : item),
        })));
        const loaded = loadFateSettings('c1').tendencies.find(item => item.id === 'pleasure')!;
        expect(loaded.name).toBe('欲望与本能');
        expect(loaded.meaning).toContain('食欲');
    });

    it('改过名称或含义时保持原样，停用状态和自定义条目都保留', () => {
        saveFateSettings('c2', withPleasure(settings => ({
            ...settings,
            tendencies: settings.tendencies.map(item => item.id === 'pleasure'
                ? { id: 'pleasure', name: '我的玩乐', meaning: '我自己写的含义' }
                : item).concat({ id: 'custom_god', name: '自定义神', meaning: '自定义含义' }),
            disabledTendencyIds: ['pleasure'],
        })));
        const loaded = loadFateSettings('c2');
        expect(loaded.tendencies.find(item => item.id === 'pleasure')?.name).toBe('我的玩乐');
        expect(loaded.tendencies.find(item => item.id === 'custom_god')?.name).toBe('自定义神');
        expect(loaded.disabledTendencyIds).toEqual(['pleasure']);
    });
});
