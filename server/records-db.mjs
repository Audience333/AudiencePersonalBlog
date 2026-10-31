// 档案数据层：records 表是站点内容的事实来源，由管理后台维护。
// 栏目（分类）、访问范围选项与数量上限都保存在 settings 表，可在后台
// 自由调整。档案编号一经分配永久不变（单调递增、删后不复用），
// 调整顺序或栏目只改 sort，不改编号，外链与 TXT 地址因此稳定。
// 首次启动时从 content/archives.json 种子快照导入；任何写操作在
// 一个事务内完成「修改 → 归一化排序 → 整表校验」，校验通过后
// 才写快照文件（完整/摘要 JSON + 单篇资源 + TXT + 首页统计），失败则整体回滚，
// 保证数据库与快照永远一致。
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import {
  validateContent,
  archiveText,
  recordSummary,
  normalizeColumnMeta,
  DEFAULT_LIMITS,
  MAX_PER_COLUMN_LAYOUT,
  MAX_TOTAL_LAYOUT,
} from "../scripts/archive-content.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const db = new Database(path.join(root, "data", "blog.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    en TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    lead TEXT NOT NULL DEFAULT '',
    clearance TEXT NOT NULL DEFAULT 'PUBLIC AREA',
    abstract TEXT NOT NULL DEFAULT '',
    findings_json TEXT NOT NULL DEFAULT '[]',
    links_json TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  );
`);

// 认证表：全新部署（无历史数据库）时也能直接创建管理员账号并登录。
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'reader')),
    avatar TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// 站点结构设置：栏目、访问范围选项、数量与字数上限，全部由后台维护。
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// 旧库迁移：body 列保存 Markdown 正文（文章列在详情页直接阅读）；
// extra_json 保存档案的自定义属性（键值对，详情页元信息区展示）。
{
  const columns = db.prepare(`PRAGMA table_info(records)`).all();
  if (!columns.some((column) => column.name === "body")) {
    db.exec(`ALTER TABLE records ADD COLUMN body TEXT NOT NULL DEFAULT ''`);
  }
  if (!columns.some((column) => column.name === "extra_json")) {
    db.exec(
      `ALTER TABLE records ADD COLUMN extra_json TEXT NOT NULL DEFAULT '{}'`,
    );
  }
}

const DEFAULT_COLUMNS = [
  { name: "作品", kind: "works" },
  { name: "文章", kind: "article" },
  { name: "资源库", kind: "resource" },
];
const DEFAULT_CLEARANCES = [
  "PUBLIC AREA",
  "INTERNAL AREA",
  "REFERENCE AREA",
  "PRIVATE AREA",
  "RESTRICTED",
  "PENDING REVIEW",
];

function getSetting(key, fallback) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}
function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, JSON.stringify(value));
}

/**
 * 分配下一个档案编号：单调递增、绝不复用。
 * nextId 未初始化时（旧库迁移、种子导入后）从现有最大编号顺延。
 */
function allocateId() {
  const stored = getSetting("nextId", 0);
  let next = Number.isInteger(stored) ? stored : 0;
  if (next < 1) {
    next =
      Math.max(
        0,
        ...db
          .prepare(`SELECT id FROM records`)
          .all()
          .map((row) => {
            const match = /^X-(\d+)$/.exec(row.id);
            return match ? Number(match[1]) : 0;
          }),
      ) + 1;
  }
  setSetting("nextId", next + 1);
  return `X-${String(next).padStart(3, "0")}`;
}

/** 栏目列表：[{ name, kind }]，顺序即阵列从左到右的顺序。 */
export function getColumns() {
  const stored = getSetting("columns", DEFAULT_COLUMNS);
  const valid = (Array.isArray(stored) ? stored : []).filter(
    (column) => column && typeof column.name === "string" && column.name,
  );
  return valid.length ? valid : DEFAULT_COLUMNS;
}
export function getColumnNames() {
  return getColumns().map((column) => column.name);
}
export function getClearances() {
  const stored = getSetting("clearances", DEFAULT_CLEARANCES);
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_CLEARANCES;
}
export function getLimits() {
  return { ...DEFAULT_LIMITS, ...getSetting("limits", {}) };
}

const clampInt = (value, min, max, fallback) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** 调整数量与字数上限；先用新上限试校验现有数据，不合法则拒绝。 */
export function setLimits(partial) {
  const current = getLimits();
  const next = {
    minPerColumn: clampInt(
      partial?.minPerColumn,
      0,
      MAX_PER_COLUMN_LAYOUT,
      current.minPerColumn,
    ),
    maxPerColumn: clampInt(
      partial?.maxPerColumn,
      1,
      MAX_PER_COLUMN_LAYOUT,
      current.maxPerColumn,
    ),
    maxTotal: clampInt(
      partial?.maxTotal,
      1,
      MAX_TOTAL_LAYOUT,
      current.maxTotal,
    ),
    bodyMax: clampInt(partial?.bodyMax, 500, 200000, current.bodyMax),
  };
  if (next.maxPerColumn < next.minPerColumn)
    next.maxPerColumn = next.minPerColumn;
  // 新上限必须容得下现有档案，否则整体拒绝。
  validateContent(currentContent(), next);
  setSetting("limits", next);
  return next;
}

export function setClearances(clearances) {
  setSetting("clearances", clearances);
  return getClearances();
}

const rowToRecord = (row) => ({
  id: row.id,
  title: row.title,
  en: row.en,
  department: row.department,
  category: row.category,
  date: row.date,
  lead: row.lead,
  clearance: row.clearance,
  abstract: row.abstract,
  body: row.body,
  findings: JSON.parse(row.findings_json),
  source: row.source,
  links: JSON.parse(row.links_json),
  extra: JSON.parse(row.extra_json ?? "{}"),
  sort: row.sort,
});

const stripMeta = ({ sort, ...record }) => record;

export function listRecords() {
  return db
    .prepare(`SELECT * FROM records ORDER BY sort ASC, id ASC`)
    .all()
    .map(rowToRecord);
}

export function listRecordSummaries() {
  return listRecords().map(recordSummary);
}

export function getRecord(id) {
  const row = db.prepare(`SELECT * FROM records WHERE id = ?`).get(id);
  return row ? rowToRecord(row) : undefined;
}

function insertRecord(record) {
  db.prepare(
    `INSERT INTO records (id, category, title, en, department, date, lead, clearance, abstract, body, findings_json, links_json, source, extra_json, sort)
     VALUES (@id, @category, @title, @en, @department, @date, @lead, @clearance, @abstract, @body, @findings_json, @links_json, @source, @extra_json, @sort)`,
  ).run({
    id: record.id,
    category: record.category,
    title: record.title,
    en: record.en,
    department: record.department,
    date: record.date,
    lead: record.lead,
    clearance: record.clearance,
    abstract: record.abstract,
    body: record.body ?? "",
    findings_json: JSON.stringify(record.findings ?? []),
    links_json: JSON.stringify(record.links ?? []),
    source: record.source,
    extra_json: JSON.stringify(record.extra ?? {}),
    sort: record.sort ?? 0,
  });
}

export function createRecord(input) {
  const maxSort = db
    .prepare(
      `SELECT COALESCE(MAX(sort), 0) AS n FROM records WHERE category = ?`,
    )
    .get(input.category).n;
  const finalId = mutateAndSync(() => {
    const id = allocateId();
    insertRecord({ ...input, id, sort: maxSort + 1 });
    return id;
  });
  return getRecord(finalId);
}

export function updateRecord(id, input) {
  if (!getRecord(id)) return undefined;
  const finalId = mutateAndSync(() => {
    db.prepare(
      `UPDATE records SET
         category = @category, title = @title, en = @en, department = @department,
         date = @date, lead = @lead, clearance = @clearance, abstract = @abstract,
         body = @body,
         findings_json = @findings_json, links_json = @links_json, source = @source,
         extra_json = @extra_json
       WHERE id = @id`,
    ).run({
      id,
      category: input.category,
      title: input.title,
      en: input.en,
      department: input.department,
      date: input.date,
      lead: input.lead,
      clearance: input.clearance,
      abstract: input.abstract,
      body: input.body ?? "",
      findings_json: JSON.stringify(input.findings ?? []),
      links_json: JSON.stringify(input.links ?? []),
      source: input.source,
      extra_json: JSON.stringify(input.extra ?? {}),
    });
    return id;
  });
  return getRecord(finalId);
}

export function deleteRecord(id) {
  if (!getRecord(id)) return false;
  mutateAndSync(() => {
    db.prepare(`DELETE FROM records WHERE id = ?`).run(id);
    return undefined;
  });
  return true;
}

/** 站点内容当前形态：供设置变更前做试校验。 */
function currentContent() {
  const names = getColumnNames();
  return {
    categories: names,
    columns: names,
    columnMeta: getColumns(),
    records: listRecords().map(stripMeta),
  };
}

/**
 * 应用新的栏目列表：先按 previousName 改名，再把被删除栏目的档案
 * 迁移到 moves 指定的目标，最后落新配置并归一化编号。
 * 任何一步不合法都会让事务整体回滚。
 */
export function applyColumns(nextColumns, moves = []) {
  const previous = getColumnNames();
  mutateAndSync(() => {
    const rename = db.prepare(
      `UPDATE records SET category = ? WHERE category = ?`,
    );
    for (const column of nextColumns) {
      if (
        column.previousName &&
        column.previousName !== column.name &&
        previous.includes(column.previousName)
      )
        rename.run(column.name, column.previousName);
    }
    for (const move of moves) rename.run(move.to, move.from);
    setSetting(
      "columns",
      nextColumns.map(({ name, kind }) => ({ name, kind })),
    );
    return undefined;
  });
  return getColumns();
}

// 写操作公共流程：mutator 返回新记录的 id（如有），
// 事务内归一化排序并整表校验；编号在事务内一经分配即固定。
function mutateAndSync(mutator) {
  const run = db.transaction(() => {
    const marker = mutator();
    normalizeSort();
    const content = validateContent(currentContent(), getLimits());
    return { content, finalId: marker };
  });
  const { content, finalId } = run();
  writeSnapshot(content);
  return finalId;
}

// 按列顺序重排显示顺序（sort）；编号永久稳定，此处绝不做改动。
function normalizeSort() {
  const names = getColumnNames();
  const ordered = [
    ...names.flatMap((category) =>
      db
        .prepare(
          `SELECT * FROM records WHERE category = ? ORDER BY sort ASC, id ASC`,
        )
        .all(category)
        .map(rowToRecord),
    ),
    // 兜底：不属于任何栏目的历史数据排在最后，避免静默丢失。
    ...db
      .prepare(
        `SELECT * FROM records WHERE category NOT IN (${names.map(() => "?").join(",")})`,
      )
      .all(...names)
      .map(rowToRecord),
  ];
  const update = db.prepare(`UPDATE records SET sort = ? WHERE id = ?`);
  db.transaction(() => {
    ordered.forEach((record, index) => {
      if (record.sort !== index + 1) update.run(index + 1, record.id);
    });
  })();
}

// 把校验过的内容写入 content/ 快照与 public/ 静态资源。
function writeSnapshot(content) {
  const writeJson = (file, value) => {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };
  const summaries = {
    categories: content.categories,
    columns: content.columns,
    columnMeta: content.columnMeta,
    records: content.records.map(recordSummary),
  };
  writeJson(path.join(root, "content", "archives.json"), content);
  writeJson(path.join(root, "content", "archive-summaries.json"), summaries);
  writeJson(path.join(root, "content", "stats.json"), {
    columns: content.columns.map((name) => ({
      name,
      count: content.records.filter((r) => r.category === name).length,
    })),
  });
  const outDir = path.join(root, "public", "archives");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const record of content.records) {
    fs.writeFileSync(
      path.join(outDir, `RHINE-LAB-${record.id}.txt`),
      archiveText(record),
      "utf8",
    );
  }
  const recordsDir = path.join(root, "public", "records");
  fs.rmSync(recordsDir, { recursive: true, force: true });
  fs.mkdirSync(recordsDir, { recursive: true });
  writeJson(path.join(recordsDir, "index.json"), summaries);
  for (const record of content.records) {
    writeJson(path.join(recordsDir, `${record.id}.json`), { record });
  }
}

// 首次启动：records 表为空时从 content/archives.json 导入种子数据，
// 同时沿用快照里的栏目配置（含栏目类型）。
export function seedIfEmpty() {
  const count = db.prepare(`SELECT COUNT(*) AS n FROM records`).get().n;
  if (count > 0) return false;
  const seedPath = path.join(root, "content", "archives.json");
  const seed = validateContent(JSON.parse(fs.readFileSync(seedPath, "utf8")));
  db.transaction(() => {
    seed.records.forEach((record, index) => {
      insertRecord({ ...record, sort: index + 1 });
    });
  })();
  setSetting("columns", normalizeColumnMeta(seed.columns, seed.columnMeta));
  console.log(
    `已从 content/archives.json 导入 ${seed.records.length} 份档案。`,
  );
  return true;
}
