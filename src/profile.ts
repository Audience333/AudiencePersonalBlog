import site from "../content/site.json" with { type: "json" };
import { escapeHtml } from "./html";
import { assetUrl } from "./asset-url";
import { records, archiveColumns } from "./data";
import "./profile.css";

type SiteLink = { label: string; url: string };
type FriendLink = { label: string; labelEn?: string; url: string; note?: string };
const links = site.links as SiteLink[];
const friendLinks = site.friendLinks as FriendLink[];

// 统计直接按运行时档案数组统计：构建快照先渲染一版，initRecords()
// 从在线 API 拉到最新数据后再调用 syncProfileStats() 刷新，
// 后台增删档案后首页数字随之更新，无需重新构建。
function statItems() {
  return archiveColumns.map((name) => ({
    value: records.filter((record) => record.category === name).length,
    label: name,
  }));
}

/** 按当前 records / archiveColumns 刷新首页栏目标统计。 */
export function syncProfileStats(): void {
  const container = document.getElementById("profile-stats");
  if (!container) return;
  container.innerHTML = statItems()
    .map(
      (item) =>
        `<div><b>${item.value}</b><span>${escapeHtml(item.label)}</span></div>`,
    )
    .join("");
}

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
    <div class="profile-stats" id="profile-stats">
      ${statItems()
        .map(
          (item) =>
            `<div><b>${item.value}</b><span>${escapeHtml(item.label)}</span></div>`,
        )
        .join("")}
    </div>`;
  return panel;
}
