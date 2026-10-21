import site from "../content/site.json" with { type: "json" };
import stats from "../content/stats.json" with { type: "json" };
import { escapeHtml } from "./html";
import { assetUrl } from "./asset-url";
import "./profile.css";

type SiteLink = { label: string; url: string };
const links = site.links as SiteLink[];

const statItems = [
  { value: stats.posts, label: "文章" },
  { value: stats.views, label: "阅读" },
  { value: stats.comments, label: "评论" },
];

/** 首页进入前的站长档案面板：访客第一眼看到的个人信息。 */
export function buildProfile(): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "profile-panel";
  panel.setAttribute("aria-label", "站长档案");
  panel.innerHTML = `
    <div class="profile-head">
      <img class="profile-avatar" src="${assetUrl(site.avatar.replace(/^\//, ""))}" alt="${escapeHtml(site.author)}的头像" width="112" height="112">
      <div class="profile-id">
        <h1>${escapeHtml(site.author)}</h1>
        <p>${escapeHtml(site.authorEn)}<span> · </span>${escapeHtml(site.description)}</p>
      </div>
    </div>
    <dl class="profile-fields">
      <div><dt>在读</dt><dd>${escapeHtml(site.profile.occupation)}</dd></div>
      <div><dt>来自</dt><dd>${escapeHtml(site.profile.hometown)}</dd></div>
      <div><dt>现居</dt><dd>${escapeHtml(site.profile.location)}</dd></div>
      <div><dt>简介</dt><dd>${escapeHtml(site.profile.bio)}</dd></div>
    </dl>
    <div class="profile-links">
      ${links
        .map(
          (link) =>
            `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a>`,
        )
        .join("")}
    </div>
    <div class="profile-stats">
      ${statItems
        .map(
          (item) =>
            `<div><b>${item.value}</b><span>${item.label}</span></div>`,
        )
        .join("")}
    </div>`;
  return panel;
}
