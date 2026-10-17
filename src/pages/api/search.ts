import type { APIRoute } from 'astro';
import { listPublicPosts, parsePostTags } from '../../lib/posts';

// 全局搜索面板（⌘K）的数据接口
export const GET: APIRoute = ({ url }) => {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  if (q.length < 1) return Response.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const { items } = listPublicPosts({ q, pageSize: 8 });
  return Response.json({
    results: items.map((post) => ({
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}/`,
      tags: parsePostTags(post.tags_json),
      views: post.view_count,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
};
