// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GUIDE_KEY, initializeFirstUseGuide, readGuideStep, setGuideStep, useFirstUseGuideStep } from './firstUseGuide';

let root: Root;
let host: HTMLDivElement;

function Probe() {
    const step = useFirstUseGuideStep();
    return React.createElement('p', null, step === null ? 'no-guide' : String(step));
}

beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe('first-use memory guide（二改关闭）', () => {
    it('新装直接记成完成，不进入引导步骤', () => {
        initializeFirstUseGuide(0);
        expect(localStorage.getItem(GUIDE_KEY)).toBe('done');
        expect(readGuideStep()).toBeNull();
        initializeFirstUseGuide(3);
        expect(localStorage.getItem(GUIDE_KEY)).toBe('done');
    });

    it('已有未完成步骤时也不覆盖，但 hook 永远不返回步骤', async () => {
        setGuideStep(2);
        initializeFirstUseGuide(1);
        expect(readGuideStep()).toBe(2);
        await act(async () => root.render(React.createElement(Probe)));
        expect(host.textContent).toBe('no-guide');
    });
});
