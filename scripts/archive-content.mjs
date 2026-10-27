import fs from "node:fs/promises";

const requiredFields = [
  "id",
  "title",
  "en",
  "department",
  "category",
  "date",
  "lead",
  "clearance",
  "abstract",
  "source",
];
const COLUMN_COUNT = 3;
const MIN_PER_COLUMN = 3;
const MAX_PER_COLUMN = 12;
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const isLinkUrl = (value) => {
  if (!isText(value)) return false;
  if (value.startsWith("/")) return true;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export function validateContent(content) {
  const errors = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("档案数据必须是 JSON 对象。");
  }
  for (const key of ["categories", "columns"]) {
    const names = content[key];
    if (
      !Array.isArray(names) ||
      names.length !== COLUMN_COUNT ||
      !names.every(isText)
    ) {
      errors.push(`${key}：必须包含 ${COLUMN_COUNT} 个非空分类名称`);
    } else if (
      new Set(names).size !== COLUMN_COUNT ||
      names.includes("全部档案")
    ) {
      errors.push(`${key}：分类名称不能重复，也不能使用“全部档案”`);
    }
  }
  const categories = Array.isArray(content.categories)
    ? content.categories
    : [];
  const columns = Array.isArray(content.columns) ? content.columns : [];
  if (
    categories.some((name) => !columns.includes(name)) ||
    columns.some((name) => !categories.includes(name))
  ) {
    errors.push("categories 与 columns 必须包含相同的三个分类（顺序可以不同）");
  }
  const records = Array.isArray(content.records) ? content.records : [];
  const minTotal = MIN_PER_COLUMN * COLUMN_COUNT;
  const maxTotal = MAX_PER_COLUMN * COLUMN_COUNT;
  if (records.length < minTotal || records.length > maxTotal)
    errors.push(`records：当前阵列要求 ${minTotal} 至 ${maxTotal} 份档案`);
  const ids = new Set();
  records.forEach((record, index) => {
    const label = `records[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${label}：必须是档案对象`);
      return;
    }
    for (const key of requiredFields) {
      if (!isText(record[key])) errors.push(`${label}.${key}：必须是非空文本`);
    }
    const expectedId = `X-${String(index + 1).padStart(3, "0")}`;
    if (record.id !== expectedId)
      errors.push(`${label}.id：应为 ${expectedId}，编号须按顺序保持稳定`);
    if (ids.has(record.id)) errors.push(`${label}.id：重复编号 ${record.id}`);
    ids.add(record.id);
    if (!categories.includes(record.category))
      errors.push(`${label}.category：未知分类 ${record.category}`);
    if (
      !Array.isArray(record.findings) ||
      record.findings.length === 0 ||
      !record.findings.every(isText)
    ) {
      errors.push(`${label}.findings：必须包含至少一条非空研究记录`);
    }
    try {
      const url = new URL(record.source);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    } catch {
      errors.push(`${label}.source：必须是有效的 HTTP 或 HTTPS 链接`);
    }
    if (record.body !== undefined && record.body !== "") {
      if (typeof record.body !== "string" || record.body.length > 20000) {
        errors.push(
          `${label}.body：可选，必须是 20000 字以内的字符串（Markdown 正文）`,
        );
      }
    }
    if (record.links !== undefined) {
      if (
        !Array.isArray(record.links) ||
        !record.links.every(
          (link) =>
            link &&
            typeof link === "object" &&
            isText(link.label) &&
            isLinkUrl(link.url),
        )
      ) {
        errors.push(
          `${label}.links：必须是数组，每项含 label 与合法 url（http/https 或以 / 开头的本站路径）`,
        );
      }
    }
  });
  for (const name of columns) {
    const n = records.filter((record) => record?.category === name).length;
    if (n < MIN_PER_COLUMN || n > MAX_PER_COLUMN) {
      errors.push(
        `分类“${name}”：当前阵列要求每列 ${MIN_PER_COLUMN} 至 ${MAX_PER_COLUMN} 份档案，实际 ${n}`,
      );
    }
  }
  if (errors.length)
    throw new Error(`档案数据校验失败：\n- ${errors.join("\n- ")}`);
  return content;
}

export async function loadContent() {
  return validateContent(
    JSON.parse(
      await fs.readFile(
        new URL("../content/archives.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}

export function recordSummary(record) {
  return {
    id: record.id,
    title: record.title,
    en: record.en,
    department: record.department,
    category: record.category,
    date: record.date,
    lead: record.lead,
    clearance: record.clearance,
    abstract: record.abstract,
    source: record.source,
  };
}

export function archiveText(r) {
  return `\uFEFFRHINE LAB · INTERNAL DATABASE\nFILE ${r.id} / ${r.title}\n${r.en}\n\n科室：${r.department}\n编目范围：${r.date}\n相关人物：${r.lead}\n访问范围：${r.clearance}\n\n${r.abstract}\n\n研究记录\n${r.findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n${r.body ? `\n正文\n${r.body}\n` : ""}${r.links?.length ? `\n相关链接\n${r.links.map((l) => `${l.label}：${l.url}`).join("\n")}\n` : ""}\n设定参考：${r.source}\n本文档由站长档案终端生成。\n`;
}
