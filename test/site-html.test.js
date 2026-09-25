import assert from "node:assert/strict";
import test from "node:test";
import { parseFragment } from "parse5";
import { addHeadingIds, plainText, tableOfContents } from "../scripts/site-html.mjs";

test("documentation text uses HTML parsing and decodes entities only once", () => {
  assert.equal(
    plainText('<script>hidden()</script ><style>.hidden {}</style ><p>A&amp;B</p><p>&amp;lt;script&amp;gt; &lt;b&gt; &#39; &nbsp; end</p>'),
    "A&B &lt;script&gt; <b> ' end"
  );
  assert.equal(plainText("<p>un<strong>break</strong>able<br>next</p>"), "unbreakable next");
  assert.equal(plainText("<template><p>inactive</p></template><p>visible</p>"), "visible");
});

test("table-of-contents labels and fragment IDs cannot introduce HTML or attributes", () => {
  const input = '<h2 id="x&quot; onclick=&quot;alert(1)">&lt;img src=x onerror=alert(1)&gt; <em>Guide</em></h2>';
  const toc = tableOfContents(input);
  const nodes = parseFragment(toc).childNodes;
  assert.equal(nodes.length, 1);
  const anchor = nodes[0];
  assert.equal(anchor.tagName, "a");
  assert.deepEqual(anchor.attrs, [
    { name: "class", value: "toc-level-2" },
    { name: "href", value: '#x" onclick="alert(1)' }
  ]);
  assert.equal(anchor.childNodes.length, 1);
  assert.equal(anchor.childNodes[0].nodeName, "#text");
  assert.equal(anchor.childNodes[0].value, "<img src=x onerror=alert(1)> Guide");
});

test("heading IDs preserve existing anchors and avoid collisions", () => {
  const result = addHeadingIds('<h2 id="a-b">Existing</h2><h2>A <code>B</code></h2><h3>A B</h3><h2>!!!</h2>');
  const nodes = parseFragment(result).childNodes;
  assert.deepEqual(nodes.map((node) => node.attrs.find((attribute) => attribute.name === "id").value),
    ["a-b", "a-b-2", "a-b-3", "section"]);
  assert.equal(nodes[1].childNodes[1].tagName, "code");
  assert.equal((tableOfContents(Array.from({ length: 25 }, (_, i) => `<h2 id="h-${i}">H ${i}</h2>`).join(""))
    .match(/<a /gu) ?? []).length, 18);
});
