import { parseFragment, serialize } from "parse5";

const hidden = new Set(["script", "style", "template"]);
const blocks = new Set([
  "address", "article", "aside", "blockquote", "br", "caption", "dd", "details",
  "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer",
  "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main",
  "nav", "ol", "p", "pre", "section", "table", "tbody", "td", "tfoot", "th",
  "thead", "tr", "ul"
]);

function nodeText(node) {
  if (node.nodeName === "#text") return node.value;
  if (hidden.has(node.tagName)) return "";
  const content = (node.childNodes ?? []).map(nodeText).join("");
  return blocks.has(node.tagName) ? ` ${content} ` : content;
}

const normalizeText = (text) => text.replace(/\s+/gu, " ").trim();
const escapeHtml = (text) => String(text).replace(/[&<>"']/gu, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

function elements(node, predicate, result = []) {
  if (predicate(node)) result.push(node);
  if (!hidden.has(node.tagName)) {
    for (const child of node.childNodes ?? []) elements(child, predicate, result);
  }
  return result;
}

// HTML5 parsing decodes entities exactly once and handles malformed end tags.
// The result is plain text, not sanitized HTML; HTML sinks must escape it.
export function plainText(html) {
  return normalizeText(nodeText(parseFragment(html)));
}

export function addHeadingIds(html) {
  const fragment = parseFragment(html);
  const headings = elements(fragment, (node) => /^h[1-3]$/u.test(node.tagName ?? ""));
  const used = new Set(headings.flatMap((node) => node.attrs
    .filter((attribute) => attribute.name === "id").map((attribute) => attribute.value)));
  for (const heading of headings) {
    if (heading.attrs.some((attribute) => attribute.name === "id")) continue;
    const base = normalizeText(nodeText(heading)).toLowerCase().normalize("NFKD")
      .replace(/[^\w\s-]/gu, "")
      .replace(/\s+/gu, "-")
      .replace(/-+/gu, "-")
      .replace(/^-|-$/gu, "") || "section";
    let id = base;
    let suffix = 1;
    while (used.has(id)) id = `${base}-${++suffix}`;
    used.add(id);
    heading.attrs.push({ name: "id", value: id });
  }
  return serialize(fragment);
}

export function tableOfContents(html) {
  return elements(parseFragment(html), (node) =>
    /^h[23]$/u.test(node.tagName ?? "") && node.attrs.some((attribute) => attribute.name === "id"))
    .slice(0, 18)
    .map((heading) => {
      const id = heading.attrs.find((attribute) => attribute.name === "id").value;
      const label = normalizeText(nodeText(heading));
      return `<a class="toc-level-${heading.tagName[1]}" href="#${escapeHtml(id)}">${escapeHtml(label)}</a>`;
    }).join("");
}
