import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));
process.env.HASH_SALT = "unit-test-salt-unit-test-salt-1234";

const { keyedHash, safeEqual, sniffType, validateUpload } = await import("@/lib/security");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const PDF = new TextEncoder().encode("%PDF-1.7\n");
const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");

const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes as BlobPart], name, { type });

describe("upload validation", () => {
  it("identifies real file types from their bytes", () => {
    expect(sniffType(JPEG)).toBe("image/jpeg");
    expect(sniffType(PNG)).toBe("image/png");
    expect(sniffType(PDF)).toBe("application/pdf");
    expect(sniffType(HTML)).toBeNull();
  });

  it("rejects files whose content does not match an allowed type, whatever their name or declared type", async () => {
    const disguised = await validateUpload(file(HTML, "photo.jpg", "image/jpeg"), ["image/jpeg"], 1024);
    expect(disguised.ok).toBe(false);
    const pdfAsImage = await validateUpload(file(PDF, "x.png", "image/png"), ["image/jpeg", "image/png"], 1024);
    expect(pdfAsImage.ok).toBe(false);
  });

  it("enforces the size limit and accepts valid files", async () => {
    expect((await validateUpload(file(JPEG, "a.jpg", "image/jpeg"), ["image/jpeg"], 3)).ok).toBe(false);
    const ok = await validateUpload(file(PDF, "doc.pdf", "application/pdf"), ["application/pdf"], 1024);
    expect(ok).toMatchObject({ ok: true, type: "application/pdf", ext: "pdf" });
    expect((await validateUpload(null, ["application/pdf"], 1024)).ok).toBe(false);
  });
});

describe("hashing", () => {
  it("never returns the raw identifier and is stable", () => {
    const h = keyedHash("ip:203.0.113.7");
    expect(h).not.toContain("203.0.113.7");
    expect(h).toHaveLength(40);
    expect(keyedHash("ip:203.0.113.7")).toBe(h);
  });
  it("compares secrets in constant time and rejects length mismatches", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("short", "longer value")).toBe(false);
  });
});
