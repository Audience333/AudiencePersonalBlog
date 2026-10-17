import { marked, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';

export type Heading = { depth: 2 | 3; id: string; text: string };
export type RenderedMarkdown = { html: string; headings: Heading[]; readingMinutes: number };

function headingText(tokens: Tokens.Generic[]): string {
  return tokens.map((token) => {
    if ('text' in token && typeof token.text === 'string') return token.text;
    if ('tokens' in token && Array.isArray(token.tokens)) return headingText(token.tokens as Tokens.Generic[]);
    return '';
  }).join('').replace(/\s+/g, ' ').trim();
}

function headingId(text: string, seen: Map<string, number>): string {
  const base = text.toLocaleLowerCase('zh-CN').replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '') || 'section';
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

export function estimateReadingMinutes(source: string): number {
  const withoutCode = source.replace(/```[\s\S]*?```|`[^`]*`/g, '');
  const cjkCount = (withoutCode.match(/[㐀-鿿豈-﫿]/g) ?? []).length;
  const latinWords = withoutCode.replace(/[㐀-鿿豈-﫿]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(cjkCount / 500 + latinWords / 220));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]!);
}

function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'h3', 'code', 'pre'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      code: ['class'],
      pre: ['class'],
      div: ['class'],
      span: ['class'],
      h2: ['id'],
      h3: ['id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    transformTags: { a: (_tag, attrs) => ({ tagName: 'a', attribs: { ...attrs, rel: 'noopener noreferrer' } }) },
  });
}

// ```mermaid 代码块输出占位容器，由客户端脚本渲染成 SVG 图表。
// $$...$$ 与 $...$ 输出数学占位，由客户端 KaTeX 渲染。
const mathExtensions = [
  {
    name: 'blockMath',
    level: 'block',
    start(src: string) { return src.indexOf('$$'); },
    tokenizer(src: string) {
      const match = src.match(/^\$\$([\s\S]+?)\$\$/);
      if (!match || !match[1].trim()) return undefined;
      return { type: 'blockMath', raw: match[0], text: match[1].trim() };
    },
    renderer(token: Tokens.Generic) {
      return `<div class="math math-display">${escapeHtml(token.text)}</div>\n`;
    },
  },
  {
    name: 'inlineMath',
    level: 'inline',
    start(src: string) { return src.indexOf('$'); },
    tokenizer(src: string) {
      const match = src.match(/^\$([^$\n]+?)\$/);
      if (!match || !match[1].trim()) return undefined;
      return { type: 'inlineMath', raw: match[0], text: match[1].trim() };
    },
    renderer(token: Tokens.Generic) {
      return `<span class="math math-inline">${escapeHtml(token.text)}</span>`;
    },
  },
] as const;

marked.use({ extensions: [...mathExtensions] as never });

export async function renderMarkdownDocument(source: string): Promise<RenderedMarkdown> {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const inline = this.parser.parseInline(tokens);
    if (depth !== 2 && depth !== 3) return `<h${depth}>${inline}</h${depth}>\n`;
    const text = headingText(tokens as Tokens.Generic[]);
    const id = headingId(text, seen);
    headings.push({ depth, id, text });
    return `<h${depth} id="${id}">${inline}</h${depth}>\n`;
  };
  renderer.code = function ({ text, lang }) {
    if (lang === 'mermaid') return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
    const languageClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    return `<pre><code${languageClass}>${escapeHtml(text)}\n</code></pre>\n`;
  };
  const html = await marked.parse(source, { gfm: true, breaks: false, renderer });
  return { html: sanitize(html), headings, readingMinutes: estimateReadingMinutes(source) };
}
