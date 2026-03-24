import { describe, expect, it } from "vitest";
import { formatTime, shortSha, splitLines } from "../src/lib/utils";

describe("utils", () => {
  it("formatTime returns dash for null", () => {
    expect(formatTime(null)).toBe("—");
  });

  it("shortSha truncates to 7 chars", () => {
    expect(shortSha("abc1234567890")).toBe("abc1234");
  });

  it("shortSha returns dash for null", () => {
    expect(shortSha(null)).toBe("—");
  });

  it("splitLines filters blanks", () => {
    expect(splitLines("foo\n\nbar\n  baz  \n")).toEqual(["foo", "bar", "baz"]);
  });
});
