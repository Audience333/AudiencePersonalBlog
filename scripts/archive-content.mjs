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

// 栏目类型决定详情页的呈现方式：
// works 可在线预览，article 渲染 Markdown 正文，resource 汇总下载链接，
// generic 只按内容有无展示页签。四种是预设；也允许自由输入自定义类型
// （1–20 字），自定义类型在前台一律按 generic 方式呈现。
export const COLUMN_KINDS = ["works", "article", "resource", "generic"];
export const MAX_COLUMN_KIND_LENGTH = 20;
// 阵列物理上是 9 条通道、每列编号行 12–31，因此栏目数与每列档案数
// 仍有布局上限，但默认值已放开到上限本身，可在后台继续调低。
export const MAX_COLUMNS = 9;
export const MAX_PER_COLUMN_LAYOUT = 20;
export const MAX_TOTAL_LAYOUT = MAX_COLUMNS * MAX_PER_COLUMN_LAYOUT;

export const DEFAULT_LIMITS = {
  minPerColumn: 1,
  maxPerColumn: MAX_PER_COLUMN_LAYOUT,
  maxTotal: MAX_TOTAL_LAYOUT,
  bodyMax: 20000,
};

export const DEFAULT_COLUMN_KINDS = {
  作品: "works",
  文章: "article",
  资源库: "resource",
};

// 档案编号一旦分配就永久属于该档案：新增取单调递增的下一个号，
// 删除留空号、绝不复用，调整顺序或栏目也不改号，外链与 TXT 地址因此稳定。
export const RECORD_ID_PATTERN = /^X-\d{3,}$/;

const MAX_EXTRA_ENTRIES = 24;
const MAX_EXTRA_KEY = 30;
const MAX_EXTRA_VALUE = 500;

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

/** 由栏目名列表与（可选的）元信息生成完整的栏目描述，缺省按名称推断类型。 */
export function normalizeColumnMeta(columns, meta) {
  const byName = new Map(
    Array.isArray(meta)
      ? meta
          .filter(
            (item) =>
              item &&
              isText(item.name) &&
              isText(item.kind) &&
              item.kind.length <= MAX_COLUMN_KIND_LENGTH,
          )
          .map((item) => [item.name, item.kind])
      : [],
  );
  return columns.map((name) => ({
    name,
    kind: byName.get(name) ?? DEFAULT_COLUMN_KINDS[name] ?? "generic",
  }));
}

export function validateContent(content, limits = DEFAULT_LIMITS) {
  const errors = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("档案数据必须是 JSON 对象。");
  }
  for (const key of ["categories", "columns"]) {
    const names = content[key];
    if (
      !Array.isArray(names) ||
      names.length < 1 ||
      names.length > MAX_COLUMNS ||
      !names.every(isText)
    ) {
      errors.push(`${key}：必须包含 1 至 ${MAX_COLUMNS} 个非空分类名称`);
    } else if (
      new Set(names).size !== names.length ||
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
    errors.push("categories 与 columns 必须包含相同的分类（顺序可以不同）");
  }
  if (content.columnMeta !== undefined) {
    const meta = content.columnMeta;
    if (
      !Array.isArray(meta) ||
      meta.length !== columns.length ||
      !meta.every(
        (item) =>
          item &&
          typeof item === "object" &&
          columns.includes(item.name) &&
          isText(item.kind) &&
          item.kind.length <= MAX_COLUMN_KIND_LENGTH,
      ) ||
      new Set(meta.map((item) => item?.name)).size !== meta.length
    ) {
      errors.push(
        `columnMeta：必须为每个分类各提供一项，kind 为 1 至 ${MAX_COLUMN_KIND_LENGTH} 字（预设 ${COLUMN_KINDS.join("/")}，可自定义）`,
      );
    }
  }
  const records = Array.isArray(content.records) ? content.records : [];
  // 全站至少保留一份档案：空档案库会让前台阵列没有可选目标。
  const minTotal = Math.max(1, limits.minPerColumn * columns.length);
  const maxTotal = Math.min(
    limits.maxTotal,
    limits.maxPerColumn * Math.max(columns.length, 1),
  );
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
    if (!RECORD_ID_PATTERN.test(record.id))
      errors.push(`${label}.id：编号格式应为 X-NNN（如 X-001），实际 ${record.id}`);
    if (ids.has(record.id)) errors.push(`${label}.id：重复编号 ${record.id}`);
    ids.add(record.id);
    if (!categories.includes(record.category))
      errors.push(`${label}.category：未知分类 ${record.category}`);
    if (
      record.findings !== undefined &&
      (!Array.isArray(record.findings) || !record.findings.every(isText))
    ) {
      errors.push(`${label}.findings：必须是非空文本数组（可以留空数组）`);
    }
    try {
      const url = new URL(record.source);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    } catch {
      errors.push(`${label}.source：必须是有效的 HTTP 或 HTTPS 链接`);
    }
    if (record.body !== undefined && record.body !== "") {
      if (
        typeof record.body !== "string" ||
        record.body.length > limits.bodyMax
      ) {
        errors.push(
          `${label}.body：可选，必须是 ${limits.bodyMax} 字以内的字符串（Markdown 正文）`,
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
    if (record.extra !== undefined) {
      const extra = record.extra;
      const entries =
        extra && typeof extra === "object" && !Array.isArray(extra)
          ? Object.entries(extra)
          : null;
      if (
        !entries ||
        entries.length > MAX_EXTRA_ENTRIES ||
        entries.some(
          ([key, value]) =>
            !isText(key) ||
            key.length > MAX_EXTRA_KEY ||
            typeof value !== "string" ||
            value.length > MAX_EXTRA_VALUE,
        )
      ) {
        errors.push(
          `${label}.extra：必须是对象，最多 ${MAX_EXTRA_ENTRIES} 项，属性名 ${MAX_EXTRA_KEY} 字以内、值 ${MAX_EXTRA_VALUE} 字以内`,
        );
      }
    }
  });
  for (const name of columns) {
    const n = records.filter((record) => record?.category === name).length;
    if (n < limits.minPerColumn || n > limits.maxPerColumn) {
      errors.push(
        `分类“${name}”：当前阵列要求每列 ${limits.minPerColumn} 至 ${limits.maxPerColumn} 份档案，实际 ${n}`,
      );
    }
  }
  if (errors.length)
    throw new Error(`档案数据校验失败：\n- ${errors.join("\n- ")}`);
  return content;
}

export async function loadContent(limits) {
  return validateContent(
    JSON.parse(
      await fs.readFile(
        new URL("../content/archives.json", import.meta.url),
        "utf8",
      ),
    ),
    limits,
  );
}

export function recordSummary(record) {
  const summary = {
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
  if (record.extra && Object.keys(record.extra).length)
    summary.extra = record.extra;
  return summary;
}

export function archiveText(r) {
  const extra = Object.entries(r.extra ?? {});
  return `﻿RHINE LAB · INTERNAL DATABASE\nFILE ${r.id} / ${r.title}\n${r.en}\n\n科室：${r.department}\n编目范围：${r.date}\n相关人物：${r.lead}\n访问范围：${r.clearance}\n\n${r.abstract}\n${r.findings?.length ? `\n研究记录\n${r.findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n` : ""}${r.body ? `\n正文\n${r.body}\n` : ""}${r.links?.length ? `\n相关链接\n${r.links.map((l) => `${l.label}：${l.url}`).join("\n")}\n` : ""}${extra.length ? `\n附加属性\n${extra.map(([key, value]) => `${key}：${value}`).join("\n")}\n` : ""}\n设定参考：${r.source}\n本文档由站长档案终端生成。\n`;
}
