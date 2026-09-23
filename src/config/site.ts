export interface SiteConfig {
  name: string;
  author: string;
  description: string;
  timezone: string;
  postsPerPage: number;
  footer: string;
  defaultOgImage: string;
  socialLinks: ReadonlyArray<{ label: string; href: string }>;
}

export const siteConfig: SiteConfig = {
  name: '观众 · 作品与博客',
  author: '观众',
  description: '一个记录作品、想法与学习过程的个人网站。',
  timezone: 'Asia/Shanghai',
  postsPerPage: 10,
  footer: '慢慢写，认真做。',
  defaultOgImage: '/archive-hero-v1.png',
  socialLinks: [],
};

export function getPublicOrigin(requestUrl?: URL): URL {
  const configured = process.env.PUBLIC_SITE_ORIGIN;
  if (configured) return new URL(configured);
  if (requestUrl) return new URL(requestUrl.origin);
  return new URL('http://localhost:4321');
}
