// 档案数据层：records 表是站点内容的事实来源，由管理后台维护。
// 首次启动时从 content/archives.json 种子快照导入；任何写操作在
// 一个事务内完成「修改 → 归一化编号 → 整表校验」，校验通过后
// 才写快照文件（JSON + TXT 导出 + 首页统计），失败则整体回滚，
// 保证数据库与快照永远一致。
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import {
  validateContent,
  archiveText,
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

// 旧库迁移：body 列保存 Markdown 正文（文章列在详情页直接阅读）。
{
  const columns = db.prepare(`PRAGMA table_info(records)`).all();
  if (!columns.some((column) => column.name === "body")) {
    db.exec(`ALTER TABLE records ADD COLUMN body TEXT NOT NULL DEFAULT ''`);
  }
}

const COLUMNS = ["作品", "文章", "资源库"];

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
  sort: row.sort,
});

const stripMeta = ({ sort, ...record }) => record;

export function listRecords() {
  return db
    .prepare(`SELECT * FROM records ORDER BY sort ASC, id ASC`)
    .all()
    .map(rowToRecord);
}

export function getRecord(id) {
  const row = db.prepare(`SELECT * FROM records WHERE id = ?`).get(id);
  return row ? rowToRecord(row) : undefined;
}

function insertRecord(record) {
  db.prepare(
    `INSERT INTO records (id, category, title, en, department, date, lead, clearance, abstract, body, findings_json, links_json, source, sort)
     VALUES (@id, @category, @title, @en, @department, @date, @lead, @clearance, @abstract, @body, @findings_json, @links_json, @source, @sort)`,
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
    sort: record.sort ?? 0,
  });
}

export function createRecord(input) {
  const maxSort = db
    .prepare(
      `SELECT COALESCE(MAX(sort), 0) AS n FROM records WHERE category = ?`,
    )
    .get(input.category).n;
  const tempId = `TMP-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const finalId = mutateAndSync(() => {
    insertRecord({ ...input, id: tempId, sort: maxSort + 1 });
    return tempId;
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
         findings_json = @findings_json, links_json = @links_json, source = @source
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

// 写操作公共流程：mutator 返回临时标记（新增记录的临时 id），
// 事务内归一化并整表校验，返回标记对应的最终 id。
function mutateAndSync(mutator) {
  const run = db.transaction(() => {
    const marker = mutator();
    const idMap = normalize();
    const content = validateContent({
      categories: COLUMNS,
      columns: COLUMNS,
      records: listRecords().map(stripMeta),
    });
    return { content, finalId: marker ? idMap.get(marker) ?? marker : undefined };
  });
  const { content, finalId } = run();
  writeSnapshot(content);
  return finalId;
}

// 按列顺序重排、重新分配连续编号，返回 旧id → 新id 的映射。
function normalize() {
  const ordered = [
    ...COLUMNS.flatMap((category) =>
      db
        .prepare(
          `SELECT * FROM records WHERE category = ? ORDER BY sort ASC, id ASC`,
        )
        .all(category)
        .map(rowToRecord),
    ),
    // 兜底：不属于三列的历史数据排在最后，避免静默丢失。
    ...db
      .prepare(`SELECT * FROM records WHERE category NOT IN (?, ?, ?)`)
      .all(...COLUMNS)
      .map(rowToRecord),
  ];
  const idMap = new Map();
  const rename = db.transaction(() => {
    const changes = [];
    ordered.forEach((record, index) => {
      const nextId = `X-${String(index + 1).padStart(3, "0")}`;
      idMap.set(record.id, nextId);
      if (nextId !== record.id || record.sort !== index + 1)
        changes.push([nextId, index + 1, record.id]);
    });
    // 编号可能互换，先全部改名到临时值再落最终值，避免主键冲突。
    const temp = db.prepare(`UPDATE records SET id = ? WHERE id = ?`);
    changes.forEach(([, , oldId], i) =>
      temp.run(`REN-${i}-${oldId}`, oldId),
    );
    changes.forEach(([nextId, sort], i) =>
      db
        .prepare(`UPDATE records SET id = ?, sort = ? WHERE id = ?`)
        .run(nextId, sort, `REN-${i}-${changes[i][2]}`),
    );
  });
  rename();
  return idMap;
}

// 把校验过的内容写入 content/ 快照与 public/archives/ 下载文件。
function writeSnapshot(content) {
  fs.writeFileSync(
    path.join(root, "content", "archives.json"),
    `${JSON.stringify(content, null, 2)}\n`,
    "utf8",
  );
  const counts = COLUMNS.map(
    (name) => content.records.filter((r) => r.category === name).length,
  );
  fs.writeFileSync(
    path.join(root, "content", "stats.json"),
    `${JSON.stringify(
      { works: counts[0], articles: counts[1], resources: counts[2] },
      null,
      2,
    )}\n`,
    "utf8",
  );
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
}

// 首次启动：records 表为空时从 content/archives.json 导入种子数据。
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
  console.log(`已从 content/archives.json 导入 ${seed.records.length} 份档案。`);
  return true;
}
