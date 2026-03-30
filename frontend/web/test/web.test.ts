import { describe, expect, test } from "bun:test";

import { defaultApiBaseUrl, webRoutes } from "@gitpulse/shared";

import { backendStatusFromError } from "../src/lib/server";

describe("web app", () => {
  test("keeps the live backend default for local dev", () => {
    expect(defaultApiBaseUrl()).toBe("http://127.0.0.1:7467");
  });

  test("exposes the dashboard route at the root path", () => {
    expect(webRoutes.dashboard.path).toBe("/");
  });

  test("does not invent a backend status without a client error", () => {
    expect(
      backendStatusFromError(new Error("nope"), "http://127.0.0.1:7467"),
    ).toBeNull();
  });
});
