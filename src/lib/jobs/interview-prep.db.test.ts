import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MockProvider } from "@/lib/ai/providers/mock";
import { createTestClient, resetDatabase } from "@/test/db";

import { interviewPrepJob } from "./interview-prep";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const provider = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/ai", () => ({ getAiProvider: async () => provider.current }));
vi.mock("@/lib/ai/task-options", () => ({ loadTaskOptions: async () => ({ creativity: "BALANCED", strict: true, language: null }) }));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile(), loadFactTexts: async () => ["Their team is new."] };
});
vi.mock("./runner", () => ({ defineJob: <T,>(definition: T) => definition }));

const prisma = () => db.client!;
const context = { id: "test-job", step: async () => {}, signal: new AbortController().signal };
const answer = {
  pitch: "I make complex tools calm.",
  questions: [{ question: "Why us?", why: "Motivation.", situation: "S", task: "T", action: "A", result: "R", from: "e1" }],
  gaps: [],
  askThem: ["What does the first quarter look like?"],
};

beforeEach(async () => {
  await resetDatabase(prisma());
  await prisma().application.create({ data: { id: "app-1", company: "Ledgerly", role: "Senior Product Designer", language: "Dutch", postingText: "Ledgerly is hiring." } });
});
afterAll(() => prisma().$disconnect());

describe("interviewPrepJob", () => {
  it("writes the pack in the application's language and saves it with the application", async () => {
    const mock = new MockProvider({ reply: () => answer });
    provider.current = mock;
    expect(await interviewPrepJob.run({ applicationId: "app-1" }, context)).toEqual({ written: true });
    const saved = await prisma().application.findUniqueOrThrow({ where: { id: "app-1" } });
    expect(saved.interviewPrepWith).toBe("interview-prep@1");
    expect(saved.interviewPrep).toMatchObject({ pitch: "I make complex tools calm.", questions: [{ question: "Why us?", from: "Senior Product Designer at Northwind Logistics" }] });
    const text = [mock.calls[0].system, ...mock.calls[0].messages.map((message) => message.content)].join("\n");
    expect(text).toContain("Write everything in Dutch.");
    expect(text).toContain("- Their team is new.");
  });
});
