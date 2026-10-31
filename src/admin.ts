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
  extra?: Record<string, string>;
};
type ArchiveRecordSummary = Omit<ArchiveRecord, "body" | "findings" | "links">;

type ColumnMeta = { name: string; kind: string };
type Limits = {
  minPerColumn: number;
  maxPerColumn: number;
  maxTotal: number;
  bodyMax: number;
};
type Meta = { columns: ColumnMeta[]; clearances: string[]; limits: Limits };

const KIND_OPTIONS = [
  { value: "works", label: "作品 · 可在线预览" },
  { value: "article", label: "文章 · 正文阅读" },
  { value: "resource", label: "资源库 · 获取资源" },
  { value: "generic", label: "通用" },
];

const root = document.getElementById("admin-root")!;
let records: ArchiveRecordSummary[] = [];
let meta: Meta = {
  columns: [],
  clearances: [],
  limits: { minPerColumn: 1, maxPerColumn: 20, maxTotal: 180, bodyMax: 20000 },
};
let activeColumn = "";
let editingId: string | null = null; // null = 未编辑；"new" = 新增
let editingRecord: ArchiveRecord | undefined;
let me: { username: string; role: string } | null = null;
let view: "records" | "settings" = "records";

// 「栏目与规则」视图的编辑草稿，结构变化（增删/移动）时先收集再重绘。
type ColumnDraft = {
  name: string;
  kind: string;
  previousName?: string;
  deleted?: boolean;
  moveTo?: string;
};
let columnDrafts: ColumnDraft[] = [];
let clearanceDrafts: string[] = [];

const columnNames = () => meta.columns.map((column) => column.name);
const recordCount = (category: string) =>
  records.filter((r) => r.category === category).length;

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
        ${
          me
            ? `<button data-view="records" class="${view === "records" ? "active" : ""}">档案</button>
        <button data-view="settings" class="${view === "settings" ? "active" : ""}">栏目与规则</button>`
            : ""
        }
        <a href="/" target="_blank" rel="noopener">查看首页 ↗</a>
        ${me ? `<button id="logout">退出登录</button>` : ""}
      </nav>
    </header>
    ${content}
  </div>`;
}

function bindShell(): void {
  document.getElementById("logout")?.addEventListener("click", logout);
  document.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      view = (button as HTMLElement).dataset.view as "records" | "settings";
      editingId = null;
      if (view === "settings") resetSettingsDrafts();
      render();
    }),
  );
}

function render(): void {
  if (view === "settings") renderSettings();
  else renderManager();
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
  bindShell();
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
    findings: [] as string[],
    source: "https://github.com/Audience333/AudiencePersonalBlog",
    links: [] as RecordLink[],
    extra: {} as Record<string, string>,
  };
  const links = r.links ?? [];
  const extra = Object.entries(r.extra ?? {});
  return `<form class="admin-editor" id="record-form">
    <h3>${record ? `编辑 ${record.id}` : "新增档案"}</h3>
    <div class="admin-grid">
      <div class="admin-field"><label>栏目</label>
        <select name="category">${columnNames()
          .map(
            (c) =>
              `<option ${c === r.category ? "selected" : ""}>${escapeHtml(c)}</option>`,
          )
          .join("")}</select>
      </div>
      <div class="admin-field"><label>访问范围（可选择或直接输入新值）</label>
        <input name="clearance" list="clearance-options" value="${escapeHtml(r.clearance)}" required />
        <datalist id="clearance-options">${meta.clearances
          .map((c) => `<option value="${escapeHtml(c)}">`)
          .join("")}</datalist>
      </div>
      <div class="admin-field"><label>标题（中文）</label><input name="title" value="${escapeHtml(r.title)}" required /></div>
      <div class="admin-field"><label>标题（英文）</label><input name="en" value="${escapeHtml(r.en)}" required /></div>
      <div class="admin-field"><label>科室</label><input name="department" value="${escapeHtml(r.department)}" required /></div>
      <div class="admin-field"><label>日期 / 编目范围</label><input name="date" value="${escapeHtml(r.date)}" required /></div>
      <div class="admin-field"><label>相关人物</label><input name="lead" value="${escapeHtml(r.lead)}" required /></div>
      <div class="admin-field"><label>参考来源 URL</label><input name="source" value="${escapeHtml(r.source)}" required /></div>
      <div class="admin-field full"><label>摘要</label><textarea name="abstract" required>${escapeHtml(r.abstract)}</textarea></div>
      <div class="admin-field full"><label>正文（Markdown，${meta.limits.bodyMax} 字以内；有正文的档案在详情页可直接全文阅读）</label><textarea name="body" rows="12" placeholder="# 标题&#10;&#10;正文支持 **加粗**、*斜体*、\`代码\`、列表与链接。">${escapeHtml(r.body ?? "")}</textarea></div>
      <div class="admin-field full"><label>研究记录（每行一条，作为正文段落，可留空）</label><textarea name="findings" rows="7">${escapeHtml(r.findings.join("\n"))}</textarea></div>
      <div class="admin-field full"><label>自定义属性（键值对，展示在详情页元信息区，可留空）</label>
        <div id="extra-editor">
          ${extra
            .map(
              ([key, value]) => `<div class="admin-links-row">
              <input placeholder="属性名，如：技术栈" value="${escapeHtml(key)}" />
              <input placeholder="属性值" value="${escapeHtml(value)}" />
              <button type="button" data-remove>删除</button>
            </div>`,
            )
            .join("")}
        </div>
        <button type="button" class="admin-add" id="add-extra">＋ 添加属性</button>
      </div>
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
  const extraEditor = document.getElementById("extra-editor")!;
  const addRow = (editor: HTMLElement, placeholders: [string, string]) => {
    const row = document.createElement("div");
    row.className = "admin-links-row";
    row.innerHTML = `<input placeholder="${placeholders[0]}" /><input placeholder="${placeholders[1]}" /><button type="button" data-remove>删除</button>`;
    editor.append(row);
  };
  document
    .getElementById("add-link")!
    .addEventListener("click", () =>
      addRow(linksEditor, ["按钮文字", "https:// 或 / 开头的路径"]),
    );
  document
    .getElementById("add-extra")!
    .addEventListener("click", () =>
      addRow(extraEditor, ["属性名，如：技术栈", "属性值"]),
    );
  for (const editor of [linksEditor, extraEditor])
    editor.addEventListener("click", (event) => {
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
      const pairs = (editor: HTMLElement) =>
        [...editor.querySelectorAll<HTMLElement>(".admin-links-row")].map(
          (row) =>
            [...row.querySelectorAll("input")].map((i) =>
              i.value.trim(),
            ) as [string, string],
        );
      const links = pairs(linksEditor)
        .map(([label, url]) => ({ label, url }))
        .filter((link) => link.label && link.url);
      const extra: Record<string, string> = {};
      for (const [key, val] of pairs(extraEditor)) if (key) extra[key] = val;
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
        extra,
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
  const names = columnNames();
  if (!names.includes(activeColumn)) activeColumn = names[0] ?? "";
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
      ${names
        .map(
          (c) =>
            `<button data-column="${escapeHtml(c)}" class="${c === activeColumn ? "active" : ""}">${escapeHtml(c)}（${recordCount(c)}）</button>`,
        )
        .join("")}
    </div>
    ${editingId ? recordForm(editing) : `<button class="admin-add" id="new-record">＋ 新增「${escapeHtml(activeColumn)}」档案</button>`}
    ${listHtml}
  `);
  bindShell();
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

/* ── 栏目与规则视图 ── */

function resetSettingsDrafts(): void {
  columnDrafts = meta.columns.map((column) => ({
    name: column.name,
    kind: column.kind,
    previousName: column.name,
  }));
  clearanceDrafts = [...meta.clearances];
}

/** 结构变化（增删/移动）前先把当前输入收回草稿，避免重绘丢失。 */
function collectColumnDrafts(): void {
  document
    .querySelectorAll<HTMLElement>("#columns-editor .admin-links-row")
    .forEach((row) => {
      const index = Number(row.dataset.index);
      const draft = columnDrafts[index];
      if (!draft) return;
      const [nameInput, kindSelect, moveSelect] = [
        ...row.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
          "input, select",
        ),
      ];
      draft.name = nameInput.value;
      draft.kind = kindSelect.value;
      if (moveSelect) draft.moveTo = moveSelect.value;
    });
}

function renderSettings(): void {
  const moveTargets = columnDrafts.filter((d) => !d.deleted);
  root.innerHTML = shell(`
    <section class="admin-editor">
      <h3>栏目（阵列列）</h3>
      <p class="admin-note">栏目即首页档案阵列的列，可自由增删、改名、排序；1 至 9 列。改名与删除会自动迁移或重排档案，保存后首页刷新生效。</p>
      <div id="columns-editor">
        ${columnDrafts
          .map((draft, index) => {
            if (draft.deleted) {
              const count = draft.previousName
                ? recordCount(draft.previousName)
                : 0;
              return `<div class="admin-links-row admin-row-deleted" data-index="${index}">
                <input value="${escapeHtml(draft.name)}" disabled />
                <span class="admin-move-label">${count} 份档案 →</span>
                <select data-move>${moveTargets
                  .map(
                    (target) =>
                      `<option value="${escapeHtml(target.name)}" ${target.name === draft.moveTo ? "selected" : ""}>${escapeHtml(target.name)}</option>`,
                  )
                  .join("")}</select>
                <button type="button" data-restore="${index}">撤销删除</button>
              </div>`;
            }
            return `<div class="admin-links-row" data-index="${index}">
              <input placeholder="栏目名称" value="${escapeHtml(draft.name)}" />
              <select>${KIND_OPTIONS.map(
                (option) =>
                  `<option value="${option.value}" ${option.value === draft.kind ? "selected" : ""}>${option.label}</option>`,
              ).join("")}</select>
              <button type="button" data-move-up="${index}" ${index === 0 ? "disabled" : ""} title="上移">↑</button>
              <button type="button" data-move-down="${index}" ${index === moveTargets.length - 1 ? "disabled" : ""} title="下移">↓</button>
              <button type="button" class="danger" data-delete-column="${index}" ${columnDrafts.filter((d) => !d.deleted).length <= 1 ? "disabled" : ""} title="删除栏目">删除</button>
            </div>`;
          })
          .join("")}
      </div>
      <button type="button" class="admin-add" id="add-column">＋ 新增栏目</button>
      <div class="admin-error" id="columns-error"></div>
      <div class="admin-editor-footer">
        <button class="admin-primary" id="save-columns">保存栏目</button>
      </div>
    </section>
    <section class="admin-editor">
      <h3>访问范围选项</h3>
      <p class="admin-note">档案表单中的候选项；档案上已有的值不受影响，填写时也可以直接输入新值。</p>
      <div id="clearances-editor">
        ${clearanceDrafts
          .map(
            (c, index) => `<div class="admin-links-row">
            <input value="${escapeHtml(c)}" data-clearance="${index}" />
            <button type="button" data-remove-clearance="${index}">删除</button>
          </div>`,
          )
          .join("")}
      </div>
      <button type="button" class="admin-add" id="add-clearance">＋ 添加选项</button>
      <div class="admin-error" id="clearances-error"></div>
      <div class="admin-editor-footer">
        <button class="admin-primary" id="save-clearances">保存选项</button>
      </div>
    </section>
    <section class="admin-editor">
      <h3>数量与字数上限</h3>
      <p class="admin-note">每列最少设为 0 时允许空栏目（前台会跳过空列）。放宽上限前请确认首页阵列的显示效果，每列最多 20 份。</p>
      <div class="admin-grid">
        <div class="admin-field"><label>每列最少（份）</label><input type="number" id="limit-min" min="0" max="20" value="${meta.limits.minPerColumn}" /></div>
        <div class="admin-field"><label>每列最多</label><input type="number" id="limit-max" min="1" max="20" value="${meta.limits.maxPerColumn}" /></div>
        <div class="admin-field"><label>全站最多</label><input type="number" id="limit-total" min="1" max="180" value="${meta.limits.maxTotal}" /></div>
        <div class="admin-field"><label>正文字数上限</label><input type="number" id="limit-body" min="500" max="200000" step="500" value="${meta.limits.bodyMax}" /></div>
      </div>
      <div class="admin-error" id="limits-error"></div>
      <div class="admin-editor-footer">
        <button class="admin-primary" id="save-limits">保存上限</button>
      </div>
    </section>
  `);
  bindShell();

  document.getElementById("add-column")!.addEventListener("click", () => {
    collectColumnDrafts();
    if (columnDrafts.filter((d) => !d.deleted).length >= 9) {
      toast("最多 9 个栏目");
      return;
    }
    columnDrafts.push({
      name: `新栏目${columnDrafts.length + 1}`,
      kind: "generic",
    });
    renderSettings();
  });
  document.querySelectorAll("[data-move-up]").forEach((button) =>
    button.addEventListener("click", () => {
      collectColumnDrafts();
      const index = Number((button as HTMLElement).dataset.moveUp);
      const visible = columnDrafts.filter((d) => !d.deleted);
      const current = visible.indexOf(columnDrafts[index]);
      if (current <= 0) return;
      const swapWith = columnDrafts.indexOf(visible[current - 1]);
      [columnDrafts[index], columnDrafts[swapWith]] = [
        columnDrafts[swapWith],
        columnDrafts[index],
      ];
      renderSettings();
    }),
  );
  document.querySelectorAll("[data-move-down]").forEach((button) =>
    button.addEventListener("click", () => {
      collectColumnDrafts();
      const index = Number((button as HTMLElement).dataset.moveDown);
      const visible = columnDrafts.filter((d) => !d.deleted);
      const current = visible.indexOf(columnDrafts[index]);
      if (current < 0 || current >= visible.length - 1) return;
      const swapWith = columnDrafts.indexOf(visible[current + 1]);
      [columnDrafts[index], columnDrafts[swapWith]] = [
        columnDrafts[swapWith],
        columnDrafts[index],
      ];
      renderSettings();
    }),
  );
  document.querySelectorAll("[data-delete-column]").forEach((button) =>
    button.addEventListener("click", () => {
      collectColumnDrafts();
      const index = Number((button as HTMLElement).dataset.deleteColumn);
      const draft = columnDrafts[index];
      const count = draft.previousName ? recordCount(draft.previousName) : 0;
      if (count > 0) {
        // 非空栏目：标记待删除，档案迁移目标由下拉选择。
        draft.deleted = true;
        draft.moveTo = columnDrafts.find((d) => !d.deleted)?.name;
      } else {
        columnDrafts.splice(index, 1);
      }
      renderSettings();
    }),
  );
  document.querySelectorAll("[data-restore]").forEach((button) =>
    button.addEventListener("click", () => {
      collectColumnDrafts();
      const draft = columnDrafts[Number((button as HTMLElement).dataset.restore)];
      draft.deleted = false;
      draft.moveTo = undefined;
      renderSettings();
    }),
  );
  document.getElementById("save-columns")!.addEventListener("click", async () => {
    collectColumnDrafts();
    const active = columnDrafts.filter((d) => !d.deleted);
    const payload = {
      columns: active.map((d) => ({
        name: d.name,
        kind: d.kind,
        previousName: d.previousName,
      })),
      moves: columnDrafts
        .filter((d) => d.deleted && d.previousName)
        .map((d) => ({ from: d.previousName!, to: d.moveTo ?? "" })),
    };
    try {
      const data = await api("/api/columns", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      meta.columns = data.columns;
      toast("栏目已保存，首页刷新后生效");
      await loadRecords();
      resetSettingsDrafts();
      renderSettings();
    } catch (error) {
      document.getElementById("columns-error")!.textContent = (
        error as Error
      ).message;
    }
  });

  document.getElementById("add-clearance")!.addEventListener("click", () => {
    clearanceDrafts = [
      ...document.querySelectorAll<HTMLInputElement>(
        "#clearances-editor input",
      ),
    ].map((input) => input.value);
    clearanceDrafts.push("");
    renderSettings();
  });
  document.querySelectorAll("[data-remove-clearance]").forEach((button) =>
    button.addEventListener("click", () => {
      const index = Number((button as HTMLElement).dataset.removeClearance);
      clearanceDrafts = [
        ...document.querySelectorAll<HTMLInputElement>(
          "#clearances-editor input",
        ),
      ].map((input) => input.value);
      clearanceDrafts.splice(index, 1);
      renderSettings();
    }),
  );
  document
    .getElementById("save-clearances")!
    .addEventListener("click", async () => {
      const clearances = [
        ...document.querySelectorAll<HTMLInputElement>(
          "#clearances-editor input",
        ),
      ].map((input) => input.value);
      try {
        const data = await api("/api/clearances", {
          method: "PUT",
          body: JSON.stringify({ clearances }),
        });
        meta.clearances = data.clearances;
        clearanceDrafts = [...meta.clearances];
        toast("访问范围选项已保存");
        renderSettings();
      } catch (error) {
        document.getElementById("clearances-error")!.textContent = (
          error as Error
        ).message;
      }
    });

  document.getElementById("save-limits")!.addEventListener("click", async () => {
    const num = (id: string) =>
      Number((document.getElementById(id) as HTMLInputElement).value);
    try {
      const data = await api("/api/limits", {
        method: "PUT",
        body: JSON.stringify({
          minPerColumn: num("limit-min"),
          maxPerColumn: num("limit-max"),
          maxTotal: num("limit-total"),
          bodyMax: num("limit-body"),
        }),
      });
      meta.limits = data.limits;
      toast("上限已保存");
      renderSettings();
    } catch (error) {
      document.getElementById("limits-error")!.textContent = (
        error as Error
      ).message;
    }
  });
}

async function loadRecords(): Promise<void> {
  const data = await api("/api/records");
  records = data.records;
  if (Array.isArray(data.columnMeta) && data.columnMeta.length)
    meta.columns = data.columnMeta;
}

async function boot(): Promise<void> {
  try {
    const metaData = await api("/api/meta");
    meta = metaData;
    await loadRecords();
    resetSettingsDrafts();
    render();
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
