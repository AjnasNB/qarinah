import { createSourceRegistry } from "cockroach-crawler/sources";
import { ingestCockroachSourceRecord } from "qarinah";

const registry = createSourceRegistry();
const records = await registry.read("web", "https://example.com/");
for (const record of records) {
  const result = await ingestCockroachSourceRecord(record, { cwd: process.cwd() });
  console.log(result.revision.eventId, result.acquisition.eventId, result.capture);
}
