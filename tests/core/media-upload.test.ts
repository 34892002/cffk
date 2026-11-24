// @ts-expect-error Tests run with Bun, while this project intentionally omits Bun's global type package.
import { describe, expect, test } from "bun:test";

import { validateMediaFile } from "../../server/media/service";

describe("media upload validation", () => {
  test("accepts a PNG with a binary PNG signature", async () => {
    const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([signature], "workflow-editor.png", { type: "image/png" });

    await expect(validateMediaFile(file)).resolves.toMatchObject({ name: "workflow-editor.png", mime: "image/png" });
  });

  test("uses file content when the multipart MIME declaration is generic", async () => {
    const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([signature], "workflow-editor.png", { type: "application/octet-stream" });

    await expect(validateMediaFile(file)).resolves.toMatchObject({ name: "workflow-editor.png", mime: "image/png" });
  });

  test("recognizes WebP when binary RIFF size bytes contain UTF-8 sequences", async () => {
    const signature = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0xec, 0x95, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const file = new File([signature], "workflow-editor.webp", { type: "image/webp" });

    await expect(validateMediaFile(file)).resolves.toMatchObject({ name: "workflow-editor.webp", mime: "image/webp" });
  });
});
