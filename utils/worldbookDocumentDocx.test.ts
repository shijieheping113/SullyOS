// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDocxBlob } from '../features/collaboration/files';
import { importWorldbookDocuments, sniffDocumentKind } from './worldbookDocument';

/**
 * 世界书导入 Word 的端到端往返：用项目自己的 `createDocxBlob` 造一个真 .docx，
 * 再走世界书导入把它读成一条条目。docx 解析依赖 DOMParser，所以这个文件要 jsdom 环境。
 */
describe('worldbook document import (real .docx)', () => {
    const makeDocxFile = async (name: string, body: string): Promise<File> => {
        const blob = await createDocxBlob(body, name);
        return new File([blob], name, { type: blob.type });
    };

    it('reads a real .docx into one entry titled by the file name', async () => {
        const file = await makeDocxFile('沈家家谱.docx', '# 沈家家谱\n\n她是沈家二小姐。\n\n长姐掌管公司。');
        const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        expect(sniffDocumentKind(head, file.name, file.type)).toBe('docx');

        const result = await importWorldbookDocuments([file], { now: 1000 });
        expect(result.failures).toEqual([]);
        expect(result.books).toHaveLength(1);
        const book = result.books[0];
        expect(book.title).toBe('沈家家谱');
        expect(book.content).toContain('她是沈家二小姐。');
        expect(book.content).toContain('长姐掌管公司。');
        // markdown 记号不该漏进正文
        expect(book.content).not.toContain('# 沈家家谱');
    });

    it('keeps a .docx that was renamed to .doc readable', async () => {
        const file = await makeDocxFile('改名成老格式.doc', '正文在这里。');
        const result = await importWorldbookDocuments([file]);
        expect(result.failures).toEqual([]);
        expect(result.books[0].content).toContain('正文在这里。');
    });

    it('splits multiple Word files into separate entries, not one merged blob', async () => {
        const files = [
            await makeDocxFile('设定一.docx', '第一篇'),
            await makeDocxFile('设定二.docx', '第二篇'),
        ];
        const result = await importWorldbookDocuments(files, { now: 2000 });
        expect(result.books.map(book => book.title)).toEqual(['设定一', '设定二']);
        expect(result.books[0].content).toContain('第一篇');
        expect(result.books[0].content).not.toContain('第二篇');
    });
});
