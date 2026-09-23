import type { APIRoute } from 'astro';
import { siteConfig } from '../config/site';
import { absoluteUrl, escapeXml } from '../lib/seo';
import { listPublicPosts } from '../lib/posts';

export const GET: APIRoute = ({ url }) => {
  const posts = listPublicPosts({ pageSize: 50 }).items;
  const items = posts.map((post) => `<item><title>${escapeXml(post.title)}</title><link>${escapeXml(absoluteUrl(`/blog/${post.slug}/`, url))}</link><guid>${escapeXml(absoluteUrl(`/blog/${post.slug}/`, url))}</guid><description>${escapeXml(post.description)}</description><pubDate>${new Date(`${post.published_at}T00:00:00Z`).toUTCString()}</pubDate></item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(siteConfig.name)}</title><link>${escapeXml(absoluteUrl('/', url))}</link><description>${escapeXml(siteConfig.description)}</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
