export interface SiteConfig {
  name: string;
  author: string;
  description: string;
  timezone: string;
  postsPerPage: number;
  footer: string;
  defaultOgImage: string;
  socialLinks: ReadonlyArray<{ label: string; href: string }>;
  friendLinks: ReadonlyArray<{ label: string; href: string; note?: string }>;
  // 侧边栏个人信息
  authorProfile: {
    name: string;
    avatar: string;
    bio: string;
    hometown: string;
    location: string;
    occupation: string;
    links: ReadonlyArray<{ label: string; href: string }>;
  };
}

export const siteConfig: SiteConfig = {
  name: '观众 · 作品与博客',
  author: '观众',
  description: '一个记录作品、想法与学习过程的个人网站。',
  timezone: 'Asia/Shanghai',
  postsPerPage: 10,
  footer: '慢慢写，认真做。',
  defaultOgImage: '/archive-hero-v1.png',
  socialLinks: [
    { label: 'GitHub', href: 'https://github.com/Audience333' },
    { label: 'Bilibili', href: 'https://space.bilibili.com/2058896001' },
    { label: 'Email', href: 'mailto:1742777946@qq.com' },
  ],
  friendLinks: [
    { label: 'Travelling to next world', href: 'https://www.travellings.cn/go.html', note: '开往 · 友联接龙，随机前往下一个世界' }
  ],
  authorProfile: {
    name: 'Audience',
    avatar: '/avatar.jpg',
    bio: 'Writing notes, building projects, and learning in public.',
    hometown: 'Heze, Shandong',
    location: 'Chengdu, Sichuan',
    occupation: 'Undergraduate at Sichuan Normal University',
    links: [
      { label: 'GitHub', href: 'https://github.com/Audience333' },
      { label: 'Bilibili', href: 'https://space.bilibili.com/2058896001' },
      { label: 'Email', href: 'mailto:1742777946@qq.com' },
    ],
  },
};

export function getPublicOrigin(requestUrl?: URL): URL {
  const configured = process.env.PUBLIC_SITE_ORIGIN;
  if (configured) return new URL(configured);
  if (requestUrl) return new URL(requestUrl.origin);
  return new URL('http://localhost:4321');
}
