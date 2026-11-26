import assert from "node:assert/strict";
// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { test } from "bun:test";
import { AppError } from "../../lib/app-error";
import { PRODUCT_DESCRIPTION_LIMITS, sanitizeProductDescription } from "../../server/catalog/product-description";

test("keeps allowed rich-text formatting", () => {
  const clean = sanitizeProductDescription(
    '<p>Hello</p><h2>Title</h2><strong>bold</strong><em>em</em><blockquote>quote</blockquote><ul><li>one</li></ul><ol><li>two</li></ol><hr><br><span style="color:red">red</span><mark style="background-color:yellow">mark</mark>',
  )!;
  for (const fragment of [
    "<p>Hello</p>",
    "<h2>Title</h2>",
    "<strong>bold</strong>",
    "<em>em</em>",
    "<blockquote>quote</blockquote>",
    "<ul><li>one</li></ul>",
    "<ol><li>two</li></ol>",
    "<hr>",
    "<br>",
    ">red</span>",
    ">mark</mark>",
  ]) {
    assert.ok(clean.includes(fragment), `missing ${fragment}: ${clean}`);
  }
  assert.match(clean, /color:\s*red/);
  assert.match(clean, /background-color:\s*yellow/);
});

test("preserves the rich-text features supported by the editor", () => {
  const html = [
    "<h1>Title</h1><h4>Sub</h4>",
    "<p><strong>bold</strong> <b>bold2</b> <em>italic</em> <i>italic2</i> <s>strike</s> <del>deleted</del> <strike>struck</strike> <code>inline</code></p>",
    '<pre><code class="language-js">const a = 1;</code></pre>',
    "<blockquote>quote</blockquote><ul><li>one</li></ul><ol><li>two</li></ol><hr>",
    '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">link</a></p>',
    '<p><img src="https://example.com/a.png" alt="a" title="t"></p>',
    '<p><span style="color: #2563eb">blue</span> <mark data-color="#fef08a" style="background-color: #fef08a; color: inherit">hl</mark></p>',
  ].join("");
  const clean = sanitizeProductDescription(html)!;
  for (const fragment of [
    "<h1>Title</h1>",
    "<h4>Sub</h4>",
    "<strong>bold</strong>",
    "<b>bold2</b>",
    "<em>italic</em>",
    "<i>italic2</i>",
    "<s>strike</s>",
    "<del>deleted</del>",
    "<strike>struck</strike>",
    "<code>inline</code>",
    '<pre><code class="language-js">const a = 1;</code></pre>',
    "<blockquote>quote</blockquote>",
    "<ul><li>one</li></ul>",
    "<ol><li>two</li></ol>",
    "<hr>",
    'href="https://example.com"',
    'target="_blank"',
    'rel="noopener noreferrer"',
    'src="https://example.com/a.png"',
    'alt="a"',
    'title="t"',
    'data-color="#fef08a"',
  ]) {
    assert.ok(clean.includes(fragment), `missing ${fragment}: ${clean}`);
  }
  assert.match(clean, /color:\s*#2563eb/i);
  assert.match(clean, /background-color:\s*#fef08a/i);
});

test("validates highlight colors and code language classes", () => {
  const clean = sanitizeProductDescription(
    '<p><code class="language-js">ok</code><code class="evil">bad</code><mark data-color="red; background:url(//evil)">x</mark></p>',
  )!;
  assert.ok(clean.includes('class="language-js"'), clean);
  assert.ok(!clean.includes("evil"), clean);
  assert.ok(!clean.includes("data-color"), clean);
});

test("accepts the editor's rgba colors", () => {
  const clean = sanitizeProductDescription('<mark data-color="rgba(254,240,138,0.5)" style="background-color: rgba(254,240,138,0.5)">x</mark>')!;
  assert.ok(clean.includes('data-color="rgba(254,240,138,0.5)"'), clean);
  assert.match(clean, /background-color:\s*rgba\(254,240,138,0\.5\)/i);
});

test("removes scripts, event handlers and unsafe URLs", () => {
  const clean = sanitizeProductDescription(
    '<p>Hello</p><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">link</a><svg onload="alert(4)"></svg>',
  );
  assert.equal(clean, "<p>Hello</p><a>link</a>");
});

test("allows safe links and images", () => {
  const clean = sanitizeProductDescription('<a href="https://example.com/a?b=1">link</a><img src="https://example.com/a.png" alt="a">')!;
  assert.match(clean, /<a href="https:\/\/example\.com\/a\?b=1" rel="noopener noreferrer" target="_blank">link<\/a>/);
  assert.match(clean, /<img src="https:\/\/example\.com\/a\.png" alt="a">/);
});

test("rejects protocol-relative and data URLs", () => {
  const clean = sanitizeProductDescription('<a href="//evil.example">evil</a><img src="data:text/html,x"><img src="/media/proxy/ok">')!;
  assert.ok(!clean.includes("//evil.example"), clean);
  assert.ok(!clean.includes("data:"), clean);
  assert.ok(clean.includes('src="/media/proxy/ok"'), clean);
});

test("filters inline styles to the allowlist", () => {
  const clean = sanitizeProductDescription('<span style="color:red;position:fixed;background-color:yellow">x</span>')!;
  assert.match(clean, /color:\s*red/);
  assert.match(clean, /background-color:\s*yellow/);
  assert.ok(!clean.includes("position"), clean);
});

test("escapes inline style values so quotes cannot inject new attributes", () => {
  const payloads = [
    '<span style=\'color:red" onmouseover="alert(1)\'>x</span>',
    '<span style="color:red&quot; onmouseover=&quot;alert(1)">x</span>',
    '<span style="color:red&#34; onmouseover=&#34;alert(1)">x</span>',
    '<mark style="background-color:yellow&quot; onmouseover=&quot;alert(1)">x</mark>',
  ];

  for (const payload of payloads) {
    const clean = sanitizeProductDescription(payload)!;
    // Only one `style` attribute survives; escaped quotes stay inside it.
    assert.match(clean, /^<(span|mark) style="[^"]*">x<\/\1>$/i, clean);
  }
});

test("drops comments and returns null for empty output", () => {
  assert.equal(sanitizeProductDescription("a<!-- hidden -->b"), "ab");
  assert.equal(sanitizeProductDescription("   "), null);
  assert.equal(sanitizeProductDescription("<script>alert(1)</script>"), null);
});

test("enforces the raw and cleaned length limits", () => {
  assert.throws(
    () => sanitizeProductDescription("a".repeat(PRODUCT_DESCRIPTION_LIMITS.rawHtml + 1)),
    (cause) => cause instanceof AppError && cause.code === "PRODUCT_DESCRIPTION_TOO_LONG",
  );
  assert.throws(
    () => sanitizeProductDescription(`<p>${"a".repeat(PRODUCT_DESCRIPTION_LIMITS.cleanHtml)}</p>`),
    (cause) => cause instanceof AppError && cause.code === "PRODUCT_DESCRIPTION_TOO_LONG",
  );
});