import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Seal } from "@/components/Seal";

describe("Seal", () => {
  it("normalizes generated coordinates for stable server and browser markup", () => {
    const { container } = render(<Seal seed={5381} />);
    const values = [...container.querySelectorAll("line, circle, rect")]
      .flatMap((element) => ["x1", "x2", "y1", "y2", "cx", "cy", "x", "y"]
        .map((name) => element.getAttribute(name))
        .filter((value): value is string => value !== null));

    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => (value.split(".")[1]?.length ?? 0) <= 4)).toBe(true);
  });
});
