import { describe, expect, test } from "vitest";
import { hashBouncerContent, isCertifiedContent } from "@/lib/content-hash";

describe("draft content identity", () => {
  test("matches the backend canonical vector", () => {
    expect(hashBouncerContent("Hanami persona\nwith whitespace", "Project lore")).toBe(
      "0x319b2fe63b680c13c394d642270186440d22d0eab6f47111ddeee17b3eb75fd9",
    );
  });

  test("invalidates a certification after an exact-text edit", () => {
    const certifiedHash = hashBouncerContent("A deliberate persona", "Project lore");

    expect(isCertifiedContent(certifiedHash, "A deliberate persona", "Project lore")).toBe(true);
    expect(isCertifiedContent(certifiedHash, "A deliberate persona ", "Project lore")).toBe(false);
  });
});
