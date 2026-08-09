import { describe, expect, test } from "bun:test";
import { sanitizeProductDescription } from "../server/catalog/product-description";

describe("sanitizeProductDescription", () => {
  test("removes executable markup and unsafe attributes", () => {
    const result = sanitizeProductDescription('<script>alert(1)</script><p style="color:red" class="x">正文<img src="data:image/png;base64,x" onerror="alert(1)"></p><iframe src="https://example.com"></iframe>');
    expect(result).toBe('<p>正文</p>');
  });
  test("keeps allowed content and protects external links", () => {
    const result = sanitizeProductDescription('<h2>标题</h2><ul><li>项目</li></ul><a href="https://example.com" target="_self">链接</a><img src="/media/proxy/a.webp" alt="图片">');
    expect(result).toContain('<h2>标题</h2>');
    expect(result).toContain('<ul><li>项目</li></ul>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer" target="_blank"');
    expect(result).toContain('src="/media/proxy/a.webp"');
  });
  test("normalizes empty content", () => expect(sanitizeProductDescription("   ")).toBeNull());
});
