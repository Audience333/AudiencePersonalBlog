import { escapeHtml } from "./html";

/**
 * 极小安全的 Markdown 子集渲染：标题、段落、无序/有序列表、
 * 代码块与行内代码、加粗、斜体、链接。全部先转义再替换，
 * 不产出任何原始 HTML；链接仅允许 http/https。
 */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;

  const inline = (text: string): string =>
    escapeHtml(text)
      .replace(/`([^`]+)`/g, (_, c: string) => `<code>${c}</code>`)
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        (_, label: string, url: string) =>
          `<a href="${url}" target="_blank" rel="noopener">${label}</a>`,
      )
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? "ol" : "ul";
    html.push(
      `<${tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`,
    );
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    if (code) {
      if (/^\s*```/.test(line)) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      code = [];
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length + 1; // h2..h5，避开详情页大标题层级
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.、]\s+(.+)$/.exec(line);
    const item = ul?.[1] ?? ol?.[1];
    if (item !== undefined) {
      flushParagraph();
      const ordered = !ul;
      if (!list || list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (code) html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flush();
  return html.join("\n");
}
