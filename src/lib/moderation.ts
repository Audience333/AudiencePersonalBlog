import { getRuntimeSettings } from './settings.ts';

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
}

// 命中屏蔽关键词时返回 true（留言、弹幕、资源投稿共用）
export function isBlockedText(text: string): boolean {
  const normalized = normalize(text);
  return getRuntimeSettings().blockedCommentKeywords.some((keyword) => normalized.includes(normalize(keyword)));
}
