import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { loadOutcomeRows } from "./outcomes-data";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});

const prisma = () => db.client!;
const now = new Date("2026-10-28T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const requirements = [
  { text: "Figma", kind: "skill", skill: "Figma", years: null, language: null, keywords: ["Figma"] },
  { text: "Kubernetes", kind: "skill", skill: "Kubernetes", years: null, language: null },
];
const extracted = { title: null, company: "Acme", role: "Designer", location: null, mode: null, salary: null, deadline: null, requirements, asksForReferences: false, language: "English" };
const match = {
  items: [
    { requirement: "Figma", result: "covered", skill: "Figma", experienceIds: [], note: null },
    { requirement: "Kubernetes", result: "gap", skill: null, experienceIds: [], note: null },
  ],
};

beforeEach(async () => {
  await resetDatabase(prisma());
});

describe("loadOutcomeRows (outcome learning)", () => {
  it("turns sent applications into rows: source, fit, coverage, keywords and what happened", async () => {
    // From Find jobs, scored there, moved to Interview.
    await prisma().posting.create({ data: { source: "JSEARCH", externalId: "j1", title: "Designer", application: { create: { id: "found", role: "Product Designer", company: "Acme", sentAt: daysAgo(30), status: "INTERVIEW", furthestStage: "INTERVIEW", extracted, match, documents: { create: [{ kind: "RESUME", units: [{ id: "skills", label: "Skills", text: "Figma · Prototyping" }] }] } } } } });
    await prisma().postingScore.create({ data: { source: "JSEARCH", externalId: "j1", score: 81, reasons: [], redFlags: [], scoredWith: "score-posting@1" } });
    // Pasted, turned down after sending.
    await prisma().application.create({
      data: { id: "pasted", role: "UX Researcher", company: "Beta", sentAt: daysAgo(20), status: "REJECTED", furthestStage: "SENT", tone: "FORMAL", resumeFormat: "GULF", events: { create: [{ from: "SENT", to: "REJECTED" }] } },
    });
    // By the agent, with an employer's email and no status change.
    await prisma().application.create({
      data: { id: "agent", role: "Designer", company: "Gamma", sentAt: daysAgo(3), status: "SENT", furthestStage: "SENT", origin: "AGENT", agentScore: 91, emails: { create: [{ gmailId: "m1", threadId: "t1", direction: "INCOMING", fromAddress: "hr@gamma.example", subject: "Re: application", sentAt: daysAgo(1) }] } },
    });
    // Sent last week, no answer yet: not settled.
    await prisma().application.create({ data: { id: "recent", role: "Designer", company: "Delta", sentAt: daysAgo(5), status: "SENT", furthestStage: "SENT" } });
    // Never sent, or an agent draft awaiting review: not counted at all.
    await prisma().application.create({ data: { id: "draft", role: "Designer", company: "Epsilon" } });
    await prisma().application.create({ data: { id: "review", role: "Designer", company: "Zeta", sentAt: daysAgo(40), awaitingReview: true } });

    const rows = await loadOutcomeRows({ now });
    expect(rows.map((row) => row.id).toSorted()).toEqual(["agent", "found", "pasted"]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get("found")).toMatchObject({ source: "find-jobs", fit: 81, covered: 50, keywords: 50, progressed: true, interviewed: true, rejected: false });
    expect(byId.get("pasted")).toMatchObject({ source: "pasted", fit: null, covered: null, keywords: null, tone: "FORMAL", format: "Gulf CV", rejected: true, progressed: false });
    expect(byId.get("agent")).toMatchObject({ source: "agent", fit: 91, replied: true, progressed: false });

    const all = await loadOutcomeRows({ now, all: true });
    expect(all.map((row) => row.id)).toContain("recent");
  });
});
