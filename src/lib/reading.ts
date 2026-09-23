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
  const cjkCount = (withoutCode.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latinWords = withoutCode.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(cjkCount / 500 + latinWords / 220));
}

function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'h3', 'code', 'pre'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      code: ['class'],
      h2: ['id'],
      h3: ['id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    transformTags: { a: (_tag, attrs) => ({ tagName: 'a', attribs: { ...attrs, rel: 'noopener noreferrer' } }) },
  });
}

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
  const html = await marked.parse(source, { gfm: true, breaks: false, renderer });
  return { html: sanitize(html), headings, readingMinutes: estimateReadingMinutes(source) };
}
