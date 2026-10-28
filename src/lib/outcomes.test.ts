import { describe, expect, it } from "vitest";

import {
  answered,
  roleLabel,
  breakdowns,
  insights,
  rates,
  roleBoost,
  roleFamily,
  settled,
  smoothed,
  suggestMinScore,
  type OutcomeRow,
} from "./outcomes";

const now = new Date("2026-10-28T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

let count = 0;
/** A settled application: sent 30 days ago, no answer, unless `extra` says otherwise. */
function row(extra: Partial<OutcomeRow> = {}): OutcomeRow {
  count += 1;
  return {
    id: `a${count}`,
    role: "Product designer",
    company: `Company ${count}`,
    source: "pasted",
    tone: "WARM",
    fit: null,
    covered: null,
    keywords: null,
    format: null,
    sentAt: daysAgo(30),
    progressed: false,
    interviewed: false,
    rejected: false,
    replied: false,
    ...extra,
  };
}
const many = (n: number, extra: Partial<OutcomeRow>) => Array.from({ length: n }, () => row(extra));
const yes = { progressed: true } satisfies Partial<OutcomeRow>;

describe("what counts", () => {
  it("counts an answer as moving on, a rejection or an email back", () => {
    expect(answered(row())).toBe(false);
    expect(answered(row({ progressed: true }))).toBe(true);
    expect(answered(row({ rejected: true }))).toBe(true);
    expect(answered(row({ replied: true }))).toBe(true);
  });

  it("waits two weeks for an answer before silence counts", () => {
    expect(settled(row({ sentAt: daysAgo(3) }), now)).toBe(false);
    expect(settled(row({ sentAt: daysAgo(3), rejected: true }), now)).toBe(true);
    expect(settled(row({ sentAt: daysAgo(14) }), now)).toBe(true);
  });

  it("works out the rates, and pulls small groups towards the overall one", () => {
    expect(rates([row(yes), row({ interviewed: true, progressed: true }), row(), row()])).toEqual({
      sent: 4,
      answered: 2,
      interviews: 1,
      answerRate: 0.5,
      interviewRate: 0.25,
    });
    expect(rates([])).toMatchObject({ answerRate: null, interviewRate: null });
    // One answer out of one isn't 100%: it's pulled towards the base rate.
    expect(smoothed(1, 1, 0.2)).toBeCloseTo(0.36);
    expect(smoothed(10, 10, 0.2)).toBeCloseTo(0.771, 2);
  });
});

describe("kinds of role", () => {
  it("drops seniority, levels and extras", () => {
    expect(roleFamily("Senior Product Designer (m/w/d)")).toBe("product designer");
    expect(roleFamily("Product Designer II")).toBe("product designer");
    expect(roleFamily("Lead UX Researcher - Payments")).toBe("ux researcher");
    expect(roleFamily("Product Manager, Search")).toBe("product manager");
    expect(roleFamily("Head of Design")).toBe("design");
    expect(roleFamily("Sr. Data Engineer | Remote")).toBe("data engineer");
  });

  it("names a kind of role as people write it, acronyms kept", () => {
    expect(roleLabel("Lead UX Researcher - Payments")).toBe("UX researcher");
    expect(roleLabel("Senior Product Designer (m/w/d)")).toBe("Product designer");
    expect(roleLabel("Sr. iOS Engineer")).toBe("IOS engineer");
  });
});

describe("breakdowns and insights", () => {
  const rows = [
    ...many(5, { role: "Senior Product Designer", fit: 88, source: "agent", ...yes }),
    ...many(1, { role: "Product Designer", fit: 90, source: "agent" }),
    ...many(1, { role: "Lead UX Researcher", fit: 60, ...yes }),
    ...many(6, { role: "UX Researcher", fit: 55 }),
    ...many(3, { role: "Design Lead", fit: 72, source: "find-jobs", rejected: true }),
  ];

  it("groups by fit band in band order, and other dimensions best first, named as people write them", () => {
    const fit = breakdowns(rows).find((breakdown) => breakdown.dimension === "fit")!;
    expect(fit.groups.map((group) => [group.key, group.sent, group.answered])).toEqual([
      ["85–100", 6, 5],
      ["70–84", 3, 3],
      ["50–69", 7, 1],
    ]);
    const role = breakdowns(rows).find((breakdown) => breakdown.dimension === "role")!;
    expect(role.groups.at(-1)).toMatchObject({ key: "ux researcher", name: "UX researcher", sent: 7, answered: 1 });
    expect(role.groups.find((group) => group.key === "product designer")).toMatchObject({ name: "Product designer", sent: 6, answered: 5, enough: true });
    expect(role.groups.find((group) => group.key === "design")).toMatchObject({ sent: 3, enough: false });
    // Dimensions nobody has data for are left out.
    expect(breakdowns(rows).map((breakdown) => breakdown.dimension)).not.toContain("keywords");
  });

  it("calls out groups well above or below the overall rate, once per set of applications, good and bad in turn", () => {
    // The agent's 6 are the same applications as the 85–100 band, and the 7 UX researcher ones the 50–69 band.
    expect(insights(rows)).toEqual([
      { tone: "good", text: "Postings with a fit score of 85–100 were answered 5 times out of 6 (83%), against 56% overall." },
      { tone: "bad", text: "Postings with a fit score of 50–69 were answered once out of 7 (14%), against 56% overall." },
    ]);
    // Told apart, each says its own thing.
    const apart = [...rows, ...many(5, { role: "UX Researcher", fit: 90, source: "pasted" })];
    expect(insights(apart, 10).map((insight) => insight.text)).toContainEqual(expect.stringMatching(/^UX researcher roles/));
  });

  it("says nothing until there's enough to go on", () => {
    expect(insights(rows.slice(0, 8))).toEqual([]);
  });
});

describe("the job agent's minimum score", () => {
  it("suggests raising it when applications below a score rarely got answers", () => {
    const rows = [...many(6, { fit: 62 }), ...many(1, { fit: 66, ...yes }), ...many(5, { fit: 82, ...yes }), ...many(2, { fit: 78 })];
    // 78 got nothing either, so the line goes at 80, where every application was answered.
    expect(suggestMinScore(rows, 60)).toEqual({
      score: 80,
      reason: "Applications scored 60–79 were answered once out of 9; from 80 up, 5 out of 5.",
    });
    // Already there: nothing to suggest.
    expect(suggestMinScore(rows, 80)).toBeNull();
  });

  it("suggests lowering it when ones just under the minimum did as well as the rest", () => {
    const rows = [...many(3, { fit: 66, ...yes }), ...many(2, { fit: 67 }), ...many(4, { fit: 85, ...yes }), ...many(4, { fit: 88 })];
    expect(suggestMinScore(rows, 70)).toEqual({
      score: 65,
      reason: "Applications scored 65–69, under your minimum, were answered 3 out of 5 times (60%), as well as the rest.",
    });
  });

  it("stays quiet with too little evidence, or without any answers", () => {
    expect(suggestMinScore(many(6, { fit: 80, ...yes }), 50)).toBeNull();
    expect(suggestMinScore(many(12, { fit: 80 }), 50)).toBeNull();
    expect(suggestMinScore(many(12, { ...yes }), 50)).toBeNull();
  });
});

describe("ranking the agent's postings by what has worked", () => {
  const rows = [
    ...many(4, { role: "Senior Product Designer", ...yes }),
    ...many(1, { role: "Product Designer" }),
    ...many(5, { role: "Data Analyst" }),
    ...many(2, { role: "UX Writer", ...yes }),
  ];

  it("moves up roles that got answers and down ones that never did, with why", () => {
    expect(roleBoost("Product Designer, Payments", rows)).toEqual({
      points: 5,
      reason: "Product designer roles have been answered 4 out of 5 times for you",
    });
    expect(roleBoost("Junior Data Analyst", rows)).toEqual({ points: -8, reason: "Data analyst roles haven't been answered in 5 tries" });
  });

  it("leaves roles alone without three settled applications, or with too few overall", () => {
    expect(roleBoost("UX Writer", rows)).toEqual({ points: 0, reason: null });
    expect(roleBoost("Engineer", rows)).toEqual({ points: 0, reason: null });
    expect(roleBoost("Data Analyst", rows.slice(0, 6))).toEqual({ points: 0, reason: null });
  });
});
