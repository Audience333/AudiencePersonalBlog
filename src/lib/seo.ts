import { getPublicOrigin } from '../config/site.ts';
import type { PostRow } from './db.ts';

export function absoluteUrl(path: string, requestUrl?: URL): string {
  const origin = getPublicOrigin(requestUrl);
  return new URL(path, origin).toString();
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

export function serializeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function articleJsonLd(post: PostRow, canonical: string): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.description, datePublished: post.published_at, mainEntityOfPage: canonical };
}
