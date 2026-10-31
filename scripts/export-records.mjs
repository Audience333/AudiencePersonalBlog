import fs from "node:fs/promises";
import {
  loadContent,
  archiveText,
  recordSummary,
  normalizeColumnMeta,
} from "./archive-content.mjs";

// Validate the entire input before writing any downloads.
const content = await loadContent();
const { categories, columns, records } = content;
const columnMeta = normalizeColumnMeta(columns, content.columnMeta);
const summaries = {
  categories,
  columns,
  columnMeta,
  records: records.map(recordSummary),
};
const writeJson = (url, value) =>
  fs.writeFile(url, `${JSON.stringify(value, null, 2)}\n`, "utf8");

await writeJson(
  new URL("../content/archive-summaries.json", import.meta.url),
  summaries,
);
await writeJson(new URL("../content/stats.json", import.meta.url), {
  columns: columns.map((name) => ({
    name,
    count: records.filter((record) => record.category === name).length,
  })),
});

const output = new URL("../public/archives/", import.meta.url);
await fs.mkdir(output, { recursive: true });
for (const record of records) {
  await fs.writeFile(
    new URL(`RHINE-LAB-${record.id}.txt`, output),
    archiveText(record),
    "utf8",
  );
}

const recordsOutput = new URL("../public/records/", import.meta.url);
await fs.rm(recordsOutput, { recursive: true, force: true });
await fs.mkdir(recordsOutput, { recursive: true });
await writeJson(new URL("index.json", recordsOutput), summaries);
for (const record of records) {
  await writeJson(new URL(`${record.id}.json`, recordsOutput), { record });
}
console.log(
  `Prepared ${records.length} downloadable archive records and JSON resources.`,
);
