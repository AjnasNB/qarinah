import assert from "node:assert/strict";
import test from "node:test";
import { plainTextFromHtml } from "../scripts/html-text.mjs";

test("plainTextFromHtml extracts decoded visible text with stable word boundaries", () => {
  assert.equal(
    plainTextFromHtml("<h2>Proof <code>&lt;context&gt;</code></h2><p>A &amp; B<br>finish.</p>"),
    "Proof <context> A & B finish."
  );
});

test("plainTextFromHtml excludes script and style bodies with parser-error end tags", () => {
  assert.equal(
    plainTextFromHtml(
      "before<SCRIPT>globalThis.compromised = true</SCRIPT data-recovery='yes'>after"
      + "<style>body { display: none }</style><template>hidden</template><noscript>hidden</noscript>"
    ),
    "before after"
  );
});

test("plainTextFromHtml decodes entities exactly once", () => {
  assert.equal(
    plainTextFromHtml("&amp;lt;script&amp;gt; &amp;amp; &quot;quoted&quot; &#39;single&#39; &nbsp; end"),
    "&lt;script&gt; &amp; \"quoted\" 'single' end"
  );
});

test("plainTextFromHtml rejects non-string inputs", () => {
  assert.throws(() => plainTextFromHtml(null), /html must be a string/u);
});
