import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { testReadResume } from "./ats-actions";

// The action runs against the test database, signed in; rendering the PDF is the ATS check's own business.
const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ persistent: false, issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }),
}));
const check = vi.hoisted(() => vi.fn(async (id: string) => ({ score: 100, intact: { count: 1, total: 1 }, recovered: 1, issues: [], id })));
vi.mock("@/lib/ats-check", () => ({ checkResumePdf: check }));

const prisma = () => db.client!;

beforeEach(async () => {
  check.mockClear();
  await resetDatabase(prisma());
  await prisma().application.create({
    data: { id: "app-1", title: "Designer at Ledgerly", company: "Ledgerly", documents: { create: [{ kind: "RESUME", units: [] }] } },
  });
  await prisma().application.create({ data: { id: "app-2", title: "No documents", company: "Acme" } });
});

describe("testReadResume (the ATS check)", () => {
  it("reads back the application's tailored resume", async () => {
    expect(await testReadResume({ id: "app-1" })).toMatchObject({ ok: true, data: { score: 100 } });
    expect(check).toHaveBeenCalledWith("app-1");
  });

  it("says so when there's no resume or no application, without rendering anything", async () => {
    expect(await testReadResume({ id: "app-2" })).toEqual({ ok: false, error: "This application has no tailored resume to check." });
    expect(await testReadResume({ id: "gone" })).toEqual({ ok: false, error: "That application no longer exists." });
    expect(check).not.toHaveBeenCalled();
  });
});
