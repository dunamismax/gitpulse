import { describe, expect, test } from "bun:test";

import { defaultApiBaseUrl, webRoutes } from "@gitpulse/shared";

describe("web foundation", () => {
  test("keeps the live backend default for local dev", () => {
    expect(defaultApiBaseUrl()).toBe("http://127.0.0.1:7467");
  });

  test("exposes the dashboard route at the root path", () => {
    expect(webRoutes.dashboard.path).toBe("/");
  });
});
