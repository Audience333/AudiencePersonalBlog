import 'katex/dist/katex.min.css';

let mermaidReady = false;

// 把 Markdown 渲染出的占位节点升级成真正的公式与图表。
// KaTeX 和 Mermaid 体积较大，只在页面用到时才动态加载。
export async function enhanceProse(root: ParentNode = document): Promise<void> {
  const mathNodes = [...root.querySelectorAll<HTMLElement>('.math-inline:not([data-math-done]), .math-display:not([data-math-done])')];
  if (mathNodes.length) {
    try {
      const katex = (await import('katex')).default;
      for (const element of mathNodes) {
        element.dataset.mathDone = '1';
        try {
          katex.render(element.textContent || '', element, {
            displayMode: element.classList.contains('math-display'),
            throwOnError: false,
          });
        } catch {
          // 公式语法错误时保留原始文本
        }
      }
    } catch { /* KaTeX 加载失败时保留原始文本 */ }
  }

  const mermaidNodes = [...root.querySelectorAll<HTMLElement>('pre.mermaid:not([data-mermaid-done])')];
  if (!mermaidNodes.length) return;
  try {
    const mermaid = (await import('mermaid')).default;
    if (!mermaidReady) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: document.documentElement.dataset.theme === 'paper' ? 'default' : 'dark',
      });
      mermaidReady = true;
    }
    await mermaid.run({ nodes: mermaidNodes });
    for (const node of mermaidNodes) node.dataset.mermaidDone = '1';
  } catch { /* 图表语法错误时保留原始代码 */ }
}
