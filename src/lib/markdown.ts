import { renderMarkdownDocument } from './reading.ts';

export async function renderMarkdown(source: string): Promise<string> {
  return (await renderMarkdownDocument(source)).html;
}
