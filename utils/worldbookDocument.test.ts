import { describe, expect, it } from 'vitest';
import {
    DEFAULT_DOCUMENT_CATEGORY,
    buildWorldbookFromDocument,
    decodeDocumentText,
    htmlToPlainText,
    importWorldbookDocuments,
    isWorldbookDocumentFile,
    rtfToPlainText,
    sniffDocumentKind,
} from './worldbookDocument';

const asciiBytes = (value: string): Uint8Array => Uint8Array.from(value, char => char.charCodeAt(0));

const makeFile = (name: string, bytes: Uint8Array | string, type = ''): File => (
    new File([bytes as any], name, { type })
);

describe('worldbook document sniffing', () => {
    it('recognises the real format from the file header, not the extension', () => {
        expect(sniffDocumentKind(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), '设定.doc')).toBe('docx');
        expect(sniffDocumentKind(asciiBytes('%PDF-1.7'), '设定.txt')).toBe('pdf');
        expect(sniffDocumentKind(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), '旧稿.doc')).toBe('legacy-doc');
        expect(sniffDocumentKind(asciiBytes('{\\rtf1\\ansi 正文'), '稿件.doc')).toBe('rtf');
        expect(sniffDocumentKind(asciiBytes('<html><body>正文</body></html>'), '网页.doc')).toBe('html');
        expect(sniffDocumentKind(asciiBytes('普通纯文本'), '设定.txt')).toBe('text');
    });

    it('routes only document formats to the one-file-one-entry importer', () => {
        expect(isWorldbookDocumentFile({ name: '设定.txt' })).toBe(true);
        expect(isWorldbookDocumentFile({ name: '设定.docx' })).toBe(true);
        expect(isWorldbookDocumentFile({ name: '设定.doc' })).toBe(true);
        expect(isWorldbookDocumentFile({ name: '设定.pdf', type: 'application/pdf' })).toBe(true);
        expect(isWorldbookDocumentFile({ name: '没有扩展名', type: 'text/plain' })).toBe(true);
        // 标准世界书那条路必须原样保留
        expect(isWorldbookDocumentFile({ name: '分享世界书.json' })).toBe(false);
        expect(isWorldbookDocumentFile({ name: '分享世界书.png', type: 'image/png' })).toBe(false);
    });
});

describe('worldbook document decoding', () => {
    it('decodes plain UTF-8 text', () => {
        expect(decodeDocumentText(new TextEncoder().encode('她姓沈。'))).toBe('她姓沈。');
    });

    it('falls back to GB18030 so old Windows notepad files do not turn into garbage', () => {
        // 「你好」的 GBK 字节
        const gbk = Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]);
        expect(decodeDocumentText(gbk)).toBe('你好');
    });

    it('honours a UTF-16 BOM', () => {
        const bytes = Uint8Array.from([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59]);
        expect(decodeDocumentText(bytes)).toBe('你好');
    });

    it('strips the UTF-8 BOM instead of leaking it into the entry content', () => {
        const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('正文')]);
        expect(decodeDocumentText(bytes)).toBe('正文');
    });
});

describe('worldbook document text extraction', () => {
    it('turns RTF control words into readable paragraphs and skips the font table', () => {
        const rtf = '{\\rtf1\\ansi\\ansicpg936{\\fonttbl{\\f0\\fnil 宋体;}}\\f0 \\\'c4\\\'e3\\\'ba\\\'c3\\par 第二段\\par}';
        const text = rtfToPlainText(rtf);
        expect(text).toContain('你好');
        expect(text).toContain('第二段');
        expect(text).not.toContain('fonttbl');
        expect(text).not.toContain('宋体');
    });

    it('strips HTML saved as .doc into paragraphs', () => {
        const html = '<html><head><style>p{color:red}</style></head><body><p>第一段</p><p>第二段 &amp; 补充</p></body></html>';
        const text = htmlToPlainText(html);
        expect(text).toBe('第一段\n第二段 & 补充');
    });
});

describe('worldbook entry built from a document', () => {
    it('uses the file name as the title and the whole text as content', () => {
        const book = buildWorldbookFromDocument({ fileName: '沈家家谱.docx', text: '\n她是二小姐。\n', now: 123 });
        expect(book.title).toBe('沈家家谱');
        expect(book.content).toBe('她是二小姐。');
        expect(book.category).toBe(DEFAULT_DOCUMENT_CATEGORY);
        expect(book.createdAt).toBe(123);
    });

    it('keeps the create-form defaults so the entry is injectable right away', () => {
        const book = buildWorldbookFromDocument({ fileName: 'a.txt', text: '正文' });
        expect(book.constant).toBe(true);
        expect(book.position).toBe(1);
        expect(book.depth).toBe(4);
        expect(book.role).toBe(0);
        expect(book.order).toBe(100);
        expect(book.scanDepth).toBe(4);
        expect(book.probability).toBe(100);
        expect(book.useProbability).toBe(false);
        expect(book.disable).toBe(false);
        expect(book.key).toEqual([]);
    });

    it('leaves sourceUid undefined so the prompt keeps showing the title line', () => {
        const book = buildWorldbookFromDocument({ fileName: 'a.txt', text: '正文' });
        expect(book.sourceUid).toBeUndefined();
    });

    it('falls back to the general category when the caller passes blanks', () => {
        const book = buildWorldbookFromDocument({ fileName: 'a.txt', text: '正文', category: '   ' });
        expect(book.category).toBe(DEFAULT_DOCUMENT_CATEGORY);
    });
});

describe('worldbook document batch import', () => {
    it('imports one entry per file and keeps going after a broken file', async () => {
        const files = [
            makeFile('设定一.txt', '第一篇正文'),
            makeFile('空白.txt', '   '),
            makeFile('旧稿.doc', Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0])),
            makeFile('设定二.txt', '第二篇正文'),
        ];
        const result = await importWorldbookDocuments(files, { now: 999 });
        expect(result.books.map(book => book.title)).toEqual(['设定一', '设定二']);
        expect(result.books.map(book => book.content)).toEqual(['第一篇正文', '第二篇正文']);
        expect(result.failures.map(failure => failure.fileName)).toEqual(['空白.txt', '旧稿.doc']);
        expect(result.failures[1].error).toContain('另存为 .docx');
        // 同一批里的条目 id 不能撞
        expect(new Set(result.books.map(book => book.id)).size).toBe(2);
    });

    it('reports the reading progress so a long batch does not look frozen', async () => {
        const labels: string[] = [];
        await importWorldbookDocuments(
            [makeFile('a.txt', '一'), makeFile('b.txt', '二')],
            { onProgress: label => labels.push(label) },
        );
        expect(labels).toHaveLength(2);
        expect(labels[0]).toContain('1/2');
        expect(labels[1]).toContain('2/2');
    });

    it('writes GBK txt into the entry without mojibake', async () => {
        const result = await importWorldbookDocuments([
            makeFile('老文件.txt', Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3])),
        ]);
        expect(result.books[0].content).toBe('你好');
    });
});
