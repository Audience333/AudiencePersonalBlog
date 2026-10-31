// 数据层冒烟测试（非破坏性）：栏目新增/改名/删除迁移、上限试校验，
// 通过一个临时档案走完整个生命周期，结束时档案与快照恢复原状。
import assert from "node:assert/strict";
import {
  getColumns,
  getColumnNames,
  setLimits,
  applyColumns,
  listRecords,
  createRecord,
  deleteRecord,
  seedIfEmpty,
} from "../server/records-db.mjs";

seedIfEmpty();

const beforeNames = getColumnNames();
const beforeIds = listRecords().map((r) => r.id);
const beforeMap = new Map(listRecords().map((r) => [r.id, r.title]));
const beforeTitles = listRecords().map((r) => `${r.id}:${r.category}:${r.title}`);
console.log("初始栏目:", beforeNames.join(" / "), "档案:", beforeIds.length);

// 0. 允许空栏目
setLimits({ minPerColumn: 0 });

// 1. 新增第 4 列（自由输入的自定义类型，允许暂为空列）
applyColumns([...getColumns(), { name: "随笔", kind: "自定义类型" }]);
assert.deepEqual(getColumnNames(), [...beforeNames, "随笔"]);
assert.equal(getColumns().at(-1).kind, "自定义类型");
console.log("✔ 新增空栏目「随笔」（自定义类型）");

// 2. 在新栏目里新增一份临时档案
const temp = createRecord({
  category: "随笔",
  title: "SMOKE 临时档案",
  en: "SMOKE TEMP",
  department: "测试",
  date: "2026",
  lead: "观众",
  clearance: "PENDING REVIEW",
  abstract: "栏目迁移冒烟测试",
  body: "",
  findings: [],
  links: [],
  source: "https://example.com",
  extra: { 测试属性: "冒烟" },
});
assert.equal(temp.id, "X-026");
assert.equal(temp.extra.测试属性, "冒烟");
console.log("✔ 新增档案", temp.id, "（含自定义属性）");

// 3. 改名：随笔 → 随想，档案跟随
applyColumns(
  getColumns().map((c) =>
    c.name === "随笔" ? { name: "随想", kind: c.kind, previousName: "随笔" } : c,
  ),
);
assert.deepEqual(getColumnNames(), [...beforeNames, "随想"]);
assert.equal(
  listRecords().find((r) => r.title === "SMOKE 临时档案")?.category,
  "随想",
);
console.log("✔ 栏目改名，档案跟随");

// 4. 删除非空栏目：迁移到「作品」后删除
applyColumns(
  getColumns()
    .filter((c) => c.name !== "随想")
    .map((c) => ({ ...c, previousName: c.name })),
  [{ from: "随想", to: "作品" }],
);
assert.deepEqual(getColumnNames(), beforeNames);
const migrated = listRecords().find((r) => r.title === "SMOKE 临时档案");
assert.equal(migrated?.category, "作品");
// 编号稳定：栏目增删改与迁移之后，原有档案的编号与标题一一对应不变
const nowMap = new Map(listRecords().map((r) => [r.id, r.title]));
for (const [id, title] of beforeMap) assert.equal(nowMap.get(id), title);
console.log("✔ 删除「随想」，档案迁移到「作品」:", migrated.id, "（原有编号未漂移）");

// 5. 上限调整：当前数据下的合法与非法值
setLimits({ minPerColumn: 2 });
assert.throws(() => setLimits({ maxPerColumn: 8 })); // 文章列有 9 份
console.log("✔ 上限调整与非法上限拒绝");

// 6. 删除临时档案，恢复初始状态与默认上限
assert.equal(deleteRecord(migrated.id), true);
// 编号永不复用：X-026 已删除，下一份新档案必须取 X-027 而不是回填空号
const extra = createRecord({
  category: "作品",
  title: "SMOKE 编号复用检查",
  en: "SMOKE REUSE",
  department: "测试",
  date: "2026",
  lead: "观众",
  clearance: "PENDING REVIEW",
  abstract: "验证已删除编号不会被复用",
  body: "",
  findings: [],
  links: [],
  source: "https://example.com",
  extra: {},
});
assert.equal(extra.id, "X-027");
assert.equal(deleteRecord(extra.id), true);
console.log("✔ 已删除编号 X-026 未被复用，新档案取 X-027");
setLimits({ minPerColumn: 1, maxPerColumn: 20, maxTotal: 180, bodyMax: 20000 });
const after = listRecords();
assert.equal(after.length, beforeIds.length);
assert.deepEqual(
  after.map((r) => `${r.id}:${r.category}:${r.title}`),
  beforeTitles,
);
assert.deepEqual(getColumnNames(), beforeNames);
console.log("✔ 删除临时档案，档案顺序、编号与栏目完全恢复");

console.log("SMOKE OK");
