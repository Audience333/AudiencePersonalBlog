import "./admin.css";
import { escapeHtml } from "./html";

type RecordLink = { label: string; url: string };
type ArchiveRecord = {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  body?: string;
  findings: string[];
  source: string;
  links?: RecordLink[];
};
type ArchiveRecordSummary = Omit<ArchiveRecord, "body" | "findings" | "links">;

const COLUMNS = ["作品", "文章", "资源库"];
const CLEARANCES = [
  "PUBLIC AREA",
  "INTERNAL AREA",
  "REFERENCE AREA",
  "PRIVATE AREA",
  "RESTRICTED",
  "PENDING REVIEW",
];

const root = document.getElementById("admin-root")!;
let records: ArchiveRecordSummary[] = [];
let activeColumn = COLUMNS[0];
let editingId: string | null = null; // null = 未编辑；"new" = 新增
let editingRecord: ArchiveRecord | undefined;
let me: { username: string; role: string } | null = null;

const api = async (url: string, options: RequestInit = {}) => {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers:
      options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : undefined,
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error ?? `请求失败（${response.status}）`);
  return data;
};

const toast = (message: string) => {
  const el = document.createElement("div");
  el.className = "admin-toast";
  el.textContent = message;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("visible"));
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 300);
  }, 2200);
};

function shell(content: string): string {
  return `<div class="admin-shell">
    <header class="admin-top">
      <h1>TERMINAL ADMIN<small>档案管理后台</small></h1>
      <nav>
        <a href="/" target="_blank" rel="noopener">查看首页 ↗</a>
        ${me ? `<button id="logout">退出登录</button>` : ""}
      </nav>
    </header>
    ${content}
  </div>`;
}

function renderLogin(error = ""): void {
  editingId = null;
  root.innerHTML = shell(`<form class="admin-login" id="login-form">
    <h2>身份验证</h2>
    <p>RHINE LAB / INTERNAL DATABASE · 管理员登录</p>
    <div class="admin-error">${escapeHtml(error)}</div>
    <div class="admin-field"><label>USERNAME / 用户名</label><input name="username" autocomplete="username" required /></div>
    <div class="admin-field"><label>PASSWORD / 密码</label><input name="password" type="password" autocomplete="current-password" required /></div>
    <button class="admin-primary" type="submit">登录后台</button>
  </form>`);
  document.getElementById("logout")?.addEventListener("click", logout);
  document
    .getElementById("login-form")!
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target as HTMLFormElement;
      const username = (form.elements.namedItem("username") as HTMLInputElement)
        .value;
      const password = (form.elements.namedItem("password") as HTMLInputElement)
        .value;
      try {
        await api("/api/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        me = { username, role: "admin" };
        await boot();
      } catch (error) {
        renderLogin((error as Error).message);
      }
    });
}

async function logout(): Promise<void> {
  await api("/api/logout", { method: "POST" }).catch(() => undefined);
  me = null;
  renderLogin();
}

function recordForm(record?: ArchiveRecord): string {
  const r = record ?? {
    id: "",
    title: "",
    en: "",
    department: "",
    category: activeColumn,
    date: "",
    lead: "观众",
    clearance: "PUBLIC AREA",
    abstract: "",
    findings: [],
    source: "https://github.com/Audience333/AudiencePersonalBlog",
    links: [],
  };
  const links = r.links ?? [];
  return `<form class="admin-editor" id="record-form">
    <h3>${record ? `编辑 ${record.id}` : "新增档案"}</h3>
    <div class="admin-grid">
      <div class="admin-field"><label>分类</label>
        <select name="category">${COLUMNS.map((c) => `<option ${c === r.category ? "selected" : ""}>${c}</option>`).join("")}</select>
      </div>
      <div class="admin-field"><label>访问范围</label>
        <select name="clearance">${CLEARANCES.map((c) => `<option ${c === r.clearance ? "selected" : ""}>${c}</option>`).join("")}</select>
      </div>
      <div class="admin-field"><label>标题（中文）</label><input name="title" value="${escapeHtml(r.title)}" required /></div>
      <div class="admin-field"><label>标题（英文）</label><input name="en" value="${escapeHtml(r.en)}" required /></div>
      <div class="admin-field"><label>科室</label><input name="department" value="${escapeHtml(r.department)}" required /></div>
      <div class="admin-field"><label>日期 / 编目范围</label><input name="date" value="${escapeHtml(r.date)}" required /></div>
      <div class="admin-field"><label>相关人物</label><input name="lead" value="${escapeHtml(r.lead)}" required /></div>
      <div class="admin-field"><label>参考来源 URL</label><input name="source" value="${escapeHtml(r.source)}" required /></div>
      <div class="admin-field full"><label>摘要</label><textarea name="abstract" required>${escapeHtml(r.abstract)}</textarea></div>
      <div class="admin-field full"><label>正文（Markdown，文章列将在详情页直接渲染阅读）</label><textarea name="body" rows="12" placeholder="# 标题&#10;&#10;正文支持 **加粗**、*斜体*、\`代码\`、列表与链接。">${escapeHtml(r.body ?? "")}</textarea></div>
      <div class="admin-field full"><label>研究记录（每行一条，作为正文段落）</label><textarea name="findings" rows="7" required>${escapeHtml(r.findings.join("\n"))}</textarea></div>
      <div class="admin-field full"><label>相关链接（作品/资源库展示为可点击按钮）</label>
        <div id="links-editor">
          ${links
            .map(
              (link) => `<div class="admin-links-row">
              <input placeholder="按钮文字" value="${escapeHtml(link.label)}" />
              <input placeholder="https:// 或 / 开头的路径" value="${escapeHtml(link.url)}" />
              <button type="button" data-remove>删除</button>
            </div>`,
            )
            .join("")}
        </div>
        <button type="button" class="admin-add" id="add-link">＋ 添加链接</button>
      </div>
    </div>
    <div class="admin-error" id="form-error"></div>
    <div class="admin-editor-footer">
      <button class="admin-primary" type="submit">保存档案</button>
      <button class="admin-ghost" type="button" id="cancel-edit">取消</button>
    </div>
  </form>`;
}

function bindForm(): void {
  const linksEditor = document.getElementById("links-editor")!;
  const addRow = () => {
    const row = document.createElement("div");
    row.className = "admin-links-row";
    row.innerHTML = `<input placeholder="按钮文字" /><input placeholder="https:// 或 / 开头的路径" /><button type="button" data-remove>删除</button>`;
    linksEditor.append(row);
  };
  document.getElementById("add-link")!.addEventListener("click", addRow);
  linksEditor.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("[data-remove]");
    if (button) button.parentElement!.remove();
  });
  document.getElementById("cancel-edit")!.addEventListener("click", () => {
    editingId = null;
    renderManager();
  });
  document
    .getElementById("record-form")!
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target as HTMLFormElement;
      const value = (name: string) =>
        String(
          (form.elements.namedItem(name) as HTMLInputElement).value ?? "",
        ).trim();
      const links = [
        ...linksEditor.querySelectorAll<HTMLInputElement>(".admin-links-row"),
      ]
        .map((row) => {
          const [label, url] = [...row.querySelectorAll("input")].map((i) =>
            i.value.trim(),
          );
          return { label, url };
        })
        .filter((link) => link.label && link.url);
      const payload = {
        category: value("category"),
        title: value("title"),
        en: value("en"),
        department: value("department"),
        date: value("date"),
        lead: value("lead"),
        clearance: value("clearance"),
        abstract: value("abstract"),
        body: value("body"),
        source: value("source"),
        findings: value("findings")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        links,
      };
      try {
        if (editingId === "new") {
          await api("/api/records", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        } else {
          await api(`/api/records/${editingId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }
        toast("已保存，首页刷新后生效");
        editingId = null;
        await loadRecords();
        renderManager();
      } catch (error) {
        document.getElementById("form-error")!.textContent = (
          error as Error
        ).message;
      }
    });
}

function renderManager(): void {
  const columnRecords = records.filter((r) => r.category === activeColumn);
  const editing = editingId === "new" ? undefined : editingRecord;
  const listHtml = editingId
    ? ""
    : `<ul class="admin-list">
      ${columnRecords
        .map(
          (r) => `<li>
          <span class="rid">${r.id}</span>
          <span class="rtitle">${escapeHtml(r.title)}</span>
          <span class="rmeta">${escapeHtml(r.en)}</span>
          <span class="actions">
            <button data-edit="${r.id}">编辑</button>
            <button class="danger" data-delete="${r.id}">删除</button>
          </span>
        </li>`,
        )
        .join("")}
    </ul>`;
  root.innerHTML = shell(`
    <div class="admin-tabs">
      ${COLUMNS.map(
        (c) =>
          `<button data-column="${c}" class="${c === activeColumn ? "active" : ""}">${c}（${records.filter((r) => r.category === c).length}）</button>`,
      ).join("")}
    </div>
    ${editingId ? recordForm(editing) : `<button class="admin-add" id="new-record">＋ 新增「${activeColumn}」档案</button>`}
    ${listHtml}
  `);
  document.getElementById("logout")?.addEventListener("click", logout);
  document.querySelectorAll("[data-column]").forEach((button) =>
    button.addEventListener("click", () => {
      activeColumn = (button as HTMLElement).dataset.column!;
      editingId = null;
      renderManager();
    }),
  );
  if (editingId) {
    bindForm();
  } else {
    document.getElementById("new-record")!.addEventListener("click", () => {
      editingId = "new";
      renderManager();
    });
    document.querySelectorAll("[data-edit]").forEach((button) =>
      button.addEventListener("click", async () => {
        const editButton = button as HTMLButtonElement;
        const id = editButton.dataset.edit!;
        editButton.disabled = true;
        try {
          const data = await api(`/api/records/${id}`);
          editingRecord = data.record;
          editingId = id;
          renderManager();
        } catch (error) {
          toast(`加载档案失败：${(error as Error).message}`);
        } finally {
          editButton.disabled = false;
        }
      }),
    );
    document.querySelectorAll("[data-delete]").forEach((button) =>
      button.addEventListener("click", async () => {
        const id = (button as HTMLElement).dataset.delete!;
        const record = records.find((r) => r.id === id);
        if (!confirm(`确定删除「${record?.title ?? id}」吗？`)) return;
        try {
          await api(`/api/records/${id}`, { method: "DELETE" });
          toast("已删除");
          await loadRecords();
          renderManager();
        } catch (error) {
          toast((error as Error).message);
        }
      }),
    );
  }
}

async function loadRecords(): Promise<void> {
  const data = await api("/api/records");
  records = data.records;
}

async function boot(): Promise<void> {
  try {
    await loadRecords();
    renderManager();
  } catch (error) {
    renderLogin((error as Error).message);
  }
}

const session = await api("/api/me").catch(() => null);
if (session?.role === "admin") {
  me = session;
  await boot();
} else {
  renderLogin();
}
