// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./blobRef', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./blobRef')>();
    return {
        ...actual,
        useBlobRefUrl: vi.fn(() => undefined as string | undefined),
    };
});

import TokenImg from '../components/os/TokenImg';
import { useBlobRefUrl } from './blobRef';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('TokenImg 未就绪占位', () => {
    let root: Root;
    let container: HTMLDivElement;

    beforeEach(() => {
        vi.mocked(useBlobRefUrl).mockReturnValue(undefined);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('src 未就绪时不渲染空 src 的 img，改为同 class 占位 span', () => {
        act(() => {
            root.render(createElement(TokenImg, { value: 'blobref:b_test', alt: 'avatar', className: 'w-9 h-9' }));
        });
        expect(container.querySelector('img')).toBeNull();
        const span = container.querySelector('span.w-9');
        expect(span).not.toBeNull();
        expect(span?.getAttribute('aria-label')).toBe('avatar');
    });

    it('src 就绪后渲染 img', () => {
        vi.mocked(useBlobRefUrl).mockReturnValue('blob:mock-ready');
        act(() => {
            root.render(createElement(TokenImg, { value: 'blobref:b_test', alt: 'avatar', className: 'w-9 h-9' }));
        });
        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        expect(img?.getAttribute('src')).toBe('blob:mock-ready');
    });
});
