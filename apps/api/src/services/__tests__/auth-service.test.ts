import { describe, expect, it } from "vitest";
import { timingSafeStringEqual } from "../auth-service.js";

describe("timingSafeStringEqual", () => {
  it("returns true when strings are identical", () => {
    expect(timingSafeStringEqual("adminadmin", "adminadmin")).toBe(true);
  });

  it("returns false when values differ but length matches", () => {
    expect(timingSafeStringEqual("adminadmin", "adminxxxxx")).toBe(false);
  });

  it("returns false when lengths differ instead of throwing", () => {
    expect(timingSafeStringEqual("admin", "adminadmin")).toBe(false);
  });
});
