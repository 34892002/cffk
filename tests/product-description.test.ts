import { describe, expect, test } from "bun:test";
import { sanitizeProductDescription } from "../server/catalog/product-description";

describe("sanitizeProductDescription", () => {
  test("removes executable markup and unsafe attributes", () => {
    const result = sanitizeProductDescription('<script>alert(1)</script><p style="color:red" class="x">正文<img src="data:image/png;base64,x" onerror="alert(1)"></p><iframe src="https://example.com"></iframe>');
    expect(result).toBe('<p>正文</p>');
  });
  test("keeps approved text colors and highlights", () => {
    const result = sanitizeProductDescription('<p><span style="color:#2563eb;background-color:#fef08a">重点</span></p>');
    expect(result).toBe('<p><span style="color:#2563eb;background-color:#fef08a">重点</span></p>');
  });
  test("keeps custom HEX and RGBA colors while removing unsafe styles", () => {
    const result = sanitizeProductDescription('<p><span style="color:rgba(255,255,255,0.5);background-color:#123abc;position:absolute;background:url(javascript:alert(1));color:red">重点</span></p>');
    expect(result).toBe('<p><span style="color:rgba(255,255,255,0.5);background-color:#123abc">重点</span></p>');
  });
  test("rejects malformed RGBA colors", () => {
    const result = sanitizeProductDescription('<p><span style="color:rgba(256,0,0,1);background-color:rgba(1,2,3,1.1)">重点</span></p>');
    expect(result).toBe('<p><span>重点</span></p>');
  });
  test("keeps allowed content and protects external links", () => {
    const result = sanitizeProductDescription('<h1>主标题</h1><h2>标题</h2><ul><li>项目</li></ul><a href="https://example.com" target="_self">链接</a><img src="/media/proxy/a.webp" alt="图片">');
    expect(result).toContain('<h1>主标题</h1>');
    expect(result).toContain('<h2>标题</h2>');
    expect(result).toContain('<ul><li>项目</li></ul>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer" target="_blank"');
    expect(result).toContain('src="/media/proxy/a.webp"');
    expect(sanitizeProductDescription('<p><img src="https://example.com/image.jpg"></p>')).toContain('src="https://example.com/image.jpg"');
    expect(sanitizeProductDescription('<p><img src="javascript:alert(1)"></p>')).toBeNull();
  });
  test("normalizes empty content", () => expect(sanitizeProductDescription("   ")).toBeNull());
});
