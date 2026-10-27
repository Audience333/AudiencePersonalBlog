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
  /** Markdown 正文：文章列在详情页直接阅读，其他列可留空。 */
  body?: string;
  findings: string[];
  source: string;
  links?: ArchiveLink[];
}

export type ArchiveSummary = Omit<
  ArchiveRecord,
  "body" | "findings" | "links"
> &
  Partial<Pick<ArchiveRecord, "body" | "findings" | "links">>;

export const records: ArchiveSummary[] = content.records as ArchiveSummary[];
export const categories = ["全部档案", ...content.categories];
export const archiveColumns = content.columns;

/** 阵列列中心：列数为奇数时即正中间一列（五列时为 2，三列时为 1）。 */
export const laneCenter = (archiveColumns.length - 1) / 2;

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
  const data = await fetchJson<{ records?: ArchiveSummary[] }>([
    "api/records",
    "records/index.json",
  ]);
  if (!Array.isArray(data?.records) || data.records.length === 0) return false;
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
