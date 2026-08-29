import { parseDocument } from "htmlparser2";

const NON_VISIBLE_ELEMENTS = new Set(["noscript", "script", "style", "template"]);

function appendVisibleText(nodes, chunks) {
  for (const node of nodes) {
    if (node.type === "text") {
      chunks.push(node.data);
      continue;
    }

    // Preserve a word boundary where markup separated visible text. The site
    // search index intentionally stores text, not a fragment safe for an HTML
    // sink; callers must continue to render the result with textContent.
    chunks.push(" ");
    const elementName = typeof node.name === "string" ? node.name.toLowerCase() : "";
    if (!NON_VISIBLE_ELEMENTS.has(elementName) && Array.isArray(node.children)) {
      appendVisibleText(node.children, chunks);
    }
    chunks.push(" ");
  }
}

export function plainTextFromHtml(html) {
  if (typeof html !== "string") throw new TypeError("html must be a string");

  const document = parseDocument(html, { decodeEntities: true });
  const chunks = [];
  appendVisibleText(document.children, chunks);
  return chunks.join("").replace(/\s+/gu, " ").trim();
}
