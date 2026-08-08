import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const FRAME_TEMPLATE = "TASK QUERY\n{query}\n\nCURRENT SOURCES\n{sources}\n\nMEMORY EVIDENCE\n{items}";
export const SOURCE_TEMPLATE = "FILE {path}\n{content}";
export const ITEM_TEMPLATE = "EVENT {eventId}\nHASH {eventHash}\nKIND {kind}\nTIME {timestamp}\nTITLE {title}\nBODY\n{body}";
export const RECORD_SEPARATOR = "\n\n";

export const COMMON_RENDERER_BINDING = Object.freeze({
  lineEnding: "LF",
  frameTemplate: FRAME_TEMPLATE,
  frameTemplateSha256: sha256(FRAME_TEMPLATE),
  sourceTemplate: SOURCE_TEMPLATE,
  sourceSeparator: RECORD_SEPARATOR,
  itemTemplate: ITEM_TEMPLATE,
  itemTemplateSha256: sha256(ITEM_TEMPLATE),
  itemSeparator: RECORD_SEPARATOR,
  completeBodiesOnly: true,
  methodSpecificFieldsAllowed: false,
  itemOrder: "retrieval rank order",
  futureRendererImplementationMustBeHashed: true
});

function sha256(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function exactText(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string.`);
  assert.equal(value.includes("\r"), false, `${label} must use LF line endings.`);
  return value;
}

export function renderCurrentSources(sources) {
  assert.ok(Array.isArray(sources), "current sources must be an array.");
  return sources.map((source, index) => {
    assert.ok(source && typeof source === "object", `current source ${index} must be an object.`);
    const sourcePath = exactText(source.path, `current source ${index} path`);
    const content = exactText(source.content, `current source ${index} content`);
    return `FILE ${sourcePath}\n${content}`;
  }).join(RECORD_SEPARATOR);
}

export function renderEventItem(event) {
  assert.ok(event && typeof event === "object", "event must be an object.");
  const eventId = exactText(event.eventId, "eventId");
  const eventHash = exactText(event.hash, "event hash");
  const kind = exactText(event.kind, "event kind");
  const timestamp = exactText(event.timestamp, "event timestamp");
  const title = exactText(event.title, "event title");
  const body = exactText(event.body, "event body");
  return [
    `EVENT ${eventId}`,
    `HASH ${eventHash}`,
    `KIND ${kind}`,
    `TIME ${timestamp}`,
    `TITLE ${title}`,
    "BODY",
    body
  ].join("\n");
}

export function renderMemoryEvidence(events) {
  assert.ok(Array.isArray(events), "memory evidence must be an array.");
  return events.map(renderEventItem).join(RECORD_SEPARATOR);
}

export function renderModelFacingFrame({ query, currentSources, events }) {
  const exactQuery = exactText(query, "query");
  const sources = renderCurrentSources(currentSources);
  const items = renderMemoryEvidence(events);
  return `TASK QUERY\n${exactQuery}\n\nCURRENT SOURCES\n${sources}\n\nMEMORY EVIDENCE\n${items}`;
}

export function estimatedPortableTokens(text) {
  return Math.ceil(exactText(text, "model-facing text").length / 4);
}

export function assertCanonicalFrame({ frame, query, currentSources, events }) {
  const expected = renderModelFacingFrame({ query, currentSources, events });
  assert.equal(frame, expected, "Model-facing frame bytes differ from the canonical renderer.");
  assert.equal(frame.split(query).length - 1, 1, "The exact task query must occur once in the model-facing frame.");
  return Object.freeze({
    characters: frame.length,
    estimatedTokens: estimatedPortableTokens(frame),
    frameSha256: sha256(frame)
  });
}
