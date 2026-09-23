import type { APIRoute } from 'astro';
import { absoluteUrl, escapeXml } from '../lib/seo';
import { listPublicPosts, listPublicTags } from '../lib/posts';
import { listPublishedProjects } from '../lib/db';

export const GET: APIRoute = ({ url }) => {
  const paths = ['/', '/about/', '/blog/', '/projects/', ...listPublishedProjects().map((project) => `/projects/${project.slug}/`), ...listPublicPosts({ pageSize: 50 }).items.map((post) => `/blog/${post.slug}/`), ...listPublicTags().map(({ tag }) => `/blog/tags/${encodeURIComponent(tag)}/`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escapeXml(absoluteUrl(path, url))}</loc></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
