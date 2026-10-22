import content from "../content/archives.json" with { type: "json" };

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

export const records: ArchiveRecord[] = content.records as ArchiveRecord[];
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

/**
 * 运行时加载档案：自带服务在线时从 /api/records 取最新内容（后台改动即时生效），
 * 静态托管或离线时使用打包进来的 content/archives.json 快照。
 * 返回是否加载到了在线数据。
 */
export async function initRecords(): Promise<boolean> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/records`, {
      cache: "no-store",
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { records?: ArchiveRecord[] };
    if (!Array.isArray(data.records) || data.records.length === 0) return false;
    const valid = data.records.every(
      (record) =>
        record &&
        typeof record.id === "string" &&
        typeof record.title === "string" &&
        Array.isArray(record.findings) &&
        typeof record.category === "string" &&
        archiveColumns.includes(record.category),
    );
    if (!valid) return false;
    records.splice(0, records.length, ...data.records);
    return true;
  } catch {
    return false;
  }
}
