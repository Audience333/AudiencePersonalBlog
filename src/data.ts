import content from "../content/archive-summaries.json" with { type: "json" };

export interface ArchiveLink {
  label: string;
  url: string;
}

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  /** Markdown 正文：详情页直接阅读，可留空。 */
  body?: string;
  findings: string[];
  source: string;
  links?: ArchiveLink[];
  /** 自定义属性：后台自由添加的键值对，详情页元信息区展示。 */
  extra?: Record<string, string>;
}

export type ArchiveSummary = Omit<
  ArchiveRecord,
  "body" | "findings" | "links"
> &
  Partial<Pick<ArchiveRecord, "body" | "findings" | "links">>;

export type ColumnKind = "works" | "article" | "resource" | "generic";
export interface ColumnMeta {
  name: string;
  kind: ColumnKind;
}

const COLUMN_KINDS: ColumnKind[] = ["works", "article", "resource", "generic"];
/** 未提供栏目类型时按名称推断，保持三列默认站点的既有行为。 */
const DEFAULT_KIND_BY_NAME: Record<string, ColumnKind> = {
  作品: "works",
  文章: "article",
  资源库: "resource",
};

interface SummaryContent {
  categories: string[];
  columns: string[];
  columnMeta?: ColumnMeta[];
  records: ArchiveSummary[];
}
const imported = content as unknown as SummaryContent;

const sanitizeMeta = (
  meta: ColumnMeta[] | undefined,
  columns: string[],
): ColumnMeta[] =>
  columns.map((name) => {
    const kind = meta?.find((item) => item?.name === name)?.kind;
    return {
      name,
      kind: COLUMN_KINDS.includes(kind as ColumnKind)
        ? (kind as ColumnKind)
        : (DEFAULT_KIND_BY_NAME[name] ?? "generic"),
    };
  });

export const records: ArchiveSummary[] = imported.records as ArchiveSummary[];
export let categories = ["全部档案", ...imported.categories];
export let archiveColumns = [...imported.columns];
let columnMeta: ColumnMeta[] = sanitizeMeta(
  imported.columnMeta,
  imported.columns,
);

/** 栏目类型决定详情页呈现方式（在线预览 / 正文 / 资源获取 / 通用）。 */
export function columnKind(name: string): ColumnKind {
  return columnMeta.find((item) => item.name === name)?.kind ?? "generic";
}

/** 阵列列中心：列数为奇数时即正中间一列（五列时为 2，三列时为 1）。 */
export let laneCenter = (archiveColumns.length - 1) / 2;

export function columnFiles(lane: number) {
  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.category === archiveColumns[lane])
    .map(({ index }) => index);
}
export function fileLocation(index: number) {
  const lane = archiveColumns.indexOf(records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}

const validSummary = (record: ArchiveSummary) =>
  record &&
  typeof record.id === "string" &&
  typeof record.title === "string" &&
  typeof record.category === "string" &&
  archiveColumns.includes(record.category);

async function fetchJson<T>(paths: string[]): Promise<T | undefined> {
  for (const path of paths) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${path}`, {
        cache: "no-store",
      });
      if (response.ok) return (await response.json()) as T;
    } catch {}
  }
  return undefined;
}

/** Load only the directory while starting; full records arrive on demand. */
export async function initRecords(): Promise<boolean> {
  const data = await fetchJson<{
    records?: ArchiveSummary[];
    categories?: string[];
    columns?: string[];
    columnMeta?: ColumnMeta[];
  }>(["api/records", "records/index.json"]);
  if (!Array.isArray(data?.records) || data.records.length === 0) return false;
  // 后台可随时增删栏目：在线数据到达时先更新栏目，再校验档案归属。
  const onlineColumns = (data.columns ?? []).filter(
    (name): name is string => typeof name === "string" && name.length > 0,
  );
  if (onlineColumns.length) {
    archiveColumns = onlineColumns;
    columnMeta = sanitizeMeta(data.columnMeta, onlineColumns);
    categories = ["全部档案", ...onlineColumns];
    laneCenter = (onlineColumns.length - 1) / 2;
  }
  if (!data.records.every(validSummary)) return false;
  const loaded = new Map(
    records.filter((record) => Array.isArray(record.findings)).map((record) => [record.id, record]),
  );
  records.splice(
    0,
    records.length,
    ...data.records.map((record) => loaded.get(record.id) ?? record),
  );
  return true;
}

const detailRequests = new Map<string, Promise<ArchiveRecord>>();

export function isRecordLoaded(
  record: ArchiveSummary,
): record is ArchiveRecord {
  return Array.isArray(record.findings);
}

export function loadRecord(id: string): Promise<ArchiveRecord> {
  const existing = detailRequests.get(id);
  if (existing) return existing;
  const request = (async () => {
    const data = await fetchJson<{ record?: ArchiveRecord }>([
      `api/records/${id}`,
      `records/${id}.json`,
    ]);
    const record = data?.record;
    if (
      !record ||
      record.id !== id ||
      !validSummary(record) ||
      !Array.isArray(record.findings)
    )
      throw new Error("档案内容暂时无法读取，请联网后重试。");
    const summary = records.find((item) => item.id === id);
    if (summary) Object.assign(summary, record);
    return record;
  })();
  detailRequests.set(id, request);
  request.catch(() => detailRequests.delete(id));
  return request;
}
