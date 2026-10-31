import site from "../content/site.json" with { type: "json" };
import stats from "../content/stats.json" with { type: "json" };
import { escapeHtml } from "./html";
import { assetUrl } from "./asset-url";
import "./profile.css";

type SiteLink = { label: string; url: string };
type FriendLink = { label: string; labelEn?: string; url: string; note?: string };
const links = site.links as SiteLink[];
const friendLinks = site.friendLinks as FriendLink[];

// 统计跟随后台栏目配置：栏目增删改后首页数据同步变化。
const statItems = (
  stats.columns as { name: string; count: number }[]
).map((column) => ({ value: column.count, label: column.name }));

/** 首页进入前的站长档案面板：访客第一眼看到的个人信息。 */
export function buildProfile(): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "profile-panel";
  panel.setAttribute("aria-label", "Author profile");
  panel.innerHTML = `
    <div class="profile-head">
      <img class="profile-avatar" src="${assetUrl(site.avatar.replace(/^\//, ""))}" alt="Avatar of ${escapeHtml(site.authorEn)}" width="112" height="112">
      <div class="profile-id">
        <h1>${escapeHtml(site.authorEn)}</h1>
        <p>${escapeHtml(site.descriptionEn)}</p>
      </div>
    </div>
    <dl class="profile-fields">
      <div><dt>OCCUPATION</dt><dd>${escapeHtml(site.profile.occupationEn)}</dd></div>
      <div><dt>HOMETOWN</dt><dd>${escapeHtml(site.profile.hometownEn)}</dd></div>
      <div><dt>LOCATION</dt><dd>${escapeHtml(site.profile.locationEn)}</dd></div>
      <div><dt>BIO</dt><dd>${escapeHtml(site.profile.bio)}</dd></div>
    </dl>
    <div class="profile-links">
      ${links
        .map(
          (link) =>
            `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a>`,
        )
        .join("")}
      ${friendLinks
        .map(
          (link) =>
            `<a class="profile-friend" href="${escapeHtml(link.url)}" target="_blank" rel="noopener" title="${escapeHtml(link.label)} · ${escapeHtml(link.note ?? "")}">${escapeHtml(link.labelEn ?? link.label)} ↗</a>`,
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
