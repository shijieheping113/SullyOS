import JSZip from 'jszip';

/**
 * 从 .docx（Office Open XML 压缩包）里提取纯文本。
 *
 * 单独成模块的原因：协同工作的附件导入和世界书「整篇文档导入」都要用它。
 * 以前它内联在 `features/collaboration/files.ts` 里，而那个文件顶部就 import 了
 * `pdfText`（会拖进整个 pdfjs）。世界书只想读个 Word，不该顺手把 PDF 引擎也载入。
 * 这里只依赖 jszip。
 */
export const extractDocxText = async (file: File): Promise<string> => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('没有在 Word 文件中找到正文');
  const xml = new DOMParser().parseFromString(documentXml, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('Word 文件正文无法解析');
  const paragraphs = Array.from(xml.getElementsByTagNameNS('*', 'p'));
  return paragraphs.map(paragraph => {
    const pieces: string[] = [];
    Array.from(paragraph.getElementsByTagName('*')).forEach(node => {
      const name = node.localName;
      if (name === 't') pieces.push(node.textContent || '');
      else if (name === 'tab') pieces.push('\t');
      else if (name === 'br' || name === 'cr') pieces.push('\n');
    });
    return pieces.join('');
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
