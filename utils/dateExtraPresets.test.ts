// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import DateExtraPresets from '../components/date/DateExtraPresets';
import type { CharacterProfile } from '../types';
import { stripSensitiveCardFields } from './characterCard';
import { activeDateRules } from './dateSceneSettings';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it('views, edits, activates and copies isolated scene presets while keeping legacy writing text separate', async () => {
    let profile = {
        id: 'test',
        dateStyleConfig: { extra: '原本的长文本', rules: [{ id: 'default-rule', title: '', body: '默认场景规则', enabled: true }] },
        dateExtraPresets: [
            { id: 'daily', name: '日常', content: '生活细节', rules: [] },
            { id: 'adventure', name: '冒险', content: '', rules: [{ id: 'action', title: '', body: '加快节奏', enabled: true }] },
        ],
    } as CharacterProfile;
    function Harness() {
        const [char, setChar] = useState(profile);
        profile = char;
        return React.createElement(DateExtraPresets, { char, update: patch => setChar(previous => ({ ...previous, ...patch(previous) })) });
    }
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const click = (label: string) => act(async () => {
        const button = [...host.querySelectorAll('button')].find(el => el.textContent === label);
        expect(button).toBeTruthy();
        button!.click();
    });
    const typeName = (value: string) => act(async () => {
        const input = host.querySelector('form input')!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    try {
        await act(async () => root.render(React.createElement(Harness)));
        expect(host.textContent).toContain('当前使用：默认规则');
        await click('日常');
        expect(host.textContent).not.toContain('生活细节');
        expect(activeDateRules(profile)[0].body).toBe('默认场景规则');
        await click('使用这套');
        expect(activeDateRules(profile)).toEqual([]);

        await click('冒险');
        await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
        expect(profile.dateExtraPresets?.[1].rules?.[0].enabled).toBe(false);
        expect(activeDateRules(profile)).toEqual([]);
        await click('使用这套');
        expect(activeDateRules(profile)[0].enabled).toBe(false);

        await click('复制为新预设');
        await click('建立预设');
        expect(profile.dateExtraPresets?.[2]).toMatchObject({
            name: '冒险 副本', rules: [{ body: '加快节奏', enabled: false }],
        });
        expect(profile.dateActiveRuleSetId).toBe('adventure');
        await click('改名');
        await typeName('远行');
        await click('保存名称');
        expect(profile.dateExtraPresets?.[2].name).toBe('远行');
        await click('删除这套');
        await click('确认删除这套');
        expect(profile.dateExtraPresets).toHaveLength(2);

        await click('＋ 新建一套');
        await typeName('晚餐');
        await click('建立预设');
        expect(profile.dateExtraPresets?.[2]).toMatchObject({ name: '晚餐', rules: [] });
        await click('冒险');
        await click('删除这套');
        await click('确认删除并切回默认规则');
        expect(activeDateRules(profile)[0].body).toBe('默认场景规则');
        expect(profile.dateStyleConfig?.extra).toBe('原本的长文本');
        expect(profile.dateExtraPresets?.[0].content).toBe('生活细节');
        expect(stripSensitiveCardFields({ name: '角色', dateExtraPresets: profile.dateExtraPresets, dateActiveRuleSetId: 'adventure' }))
            .toEqual({ name: '角色' });
    } finally {
        act(() => root.unmount());
        host.remove();
    }
});
