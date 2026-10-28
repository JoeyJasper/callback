// Outcome learning: which applications got answers, and what they had in
// common, so the job search can lean towards what works for this person.
//
// Every application that went out is a row. It counts once it's "settled":
// answered, or sent long enough ago that silence means something. Rates by
// group are compared with the person's own overall rate, and nothing is
// claimed from groups too small to say anything. Rankings use rates pulled
// towards the overall one (a beta prior), so three lucky applications can't
// swing the agent.

/** Where an application came from. */
export type OutcomeSource = "pasted" | "find-jobs" | "agent" | "startups";

export type OutcomeRow = {
  id: string;
  /** The role as the posting names it. */
  role: string;
  company: string;
  source: OutcomeSource;
  tone: string;
  /** The AI's 0–100 fit score for the posting, when it was scored. */
  fit: number | null;
  /** Share of the posting's requirements the profile covered, 0–100. */
  covered: number | null;
  /** Share of the posting's required terms in the tailored resume, 0–100 (the ATS check). */
  keywords: number | null;
  /** The resume's format by country, when one was picked. */
  format: string | null;
  sentAt: Date;
  /** Screening or further, ever. */
  progressed: boolean;
  /** Interview or further, ever. */
  interviewed: boolean;
  /** Rejected after being sent: an answer, if not the hoped-for one. */
  rejected: boolean;
  /** An employer's email arrived about it. */
  replied: boolean;
};

/** Days after sending before silence counts as no answer. */
export const SETTLE_DAYS = 14;
/** The fewest settled applications a group needs before anything is said about it. */
export const MIN_GROUP = 5;
/** The prior's weight, in applications, pulling small groups towards the overall rate. */
const PRIOR = 4;

/** Whether the employer answered at all: moved it on, turned it down or wrote back. */
export const answered = (row: OutcomeRow) => row.progressed || row.rejected || row.replied;

/** Answered, or sent long enough ago that no answer is an answer. */
export function settled(row: OutcomeRow, now: Date): boolean {
  return answered(row) || now.getTime() - row.sentAt.getTime() >= SETTLE_DAYS * 86_400_000;
}

export type Rates = {
  /** Settled applications. */
  sent: number;
  answered: number;
  interviews: number;
  /** Answered ÷ sent, 0–1; null without any. */
  answerRate: number | null;
  interviewRate: number | null;
};

export function rates(rows: OutcomeRow[]): Rates {
  const sent = rows.length;
  const answers = rows.filter(answered).length;
  const interviews = rows.filter((row) => row.interviewed).length;
  return {
    sent,
    answered: answers,
    interviews,
    answerRate: sent > 0 ? answers / sent : null,
    interviewRate: sent > 0 ? interviews / sent : null,
  };
}

/** A rate pulled towards `base` by the prior, for ranking groups of different sizes fairly. */
export function smoothed(hits: number, total: number, base: number): number {
  return (hits + PRIOR * base) / (total + PRIOR);
}

const SENIORITY = new Set([
  "senior", "sr", "junior", "jr", "lead", "principal", "staff", "head", "chief", "associate", "assistant", "intern",
  "internship", "trainee", "graduate", "entry", "level", "mid", "ii", "iii", "iv", "i", "1", "2", "3", "of", "the",
  "m", "f", "d", "w", "x", "all", "genders", "remote", "hybrid", "contract", "freelance", "temporary", "part", "full", "time",
]);

/**
 * The kind of role, without seniority or extras: "Senior Product Designer
 * (m/w/d)" and "Product Designer II" are both "product designer".
 */
export function roleFamily(role: string): string {
  const main = role
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/\s[-–—|·]\s|,|\//)[0];
  const words = main
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()
    .split(" ")
    .filter((word) => word && !SENIORITY.has(word));
  return words.join(" ");
}

/** The kind of role as people write it: "UX researcher" for "Lead UX Researcher - Payments". */
export function roleLabel(role: string): string {
  const main = role.replace(/\([^)]*\)/g, " ").split(/\s[-–—|·]\s|,|\//)[0];
  const kept = main
    .replace(/[^\p{L}\p{N}+#\s]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !SENIORITY.has(word.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")));
  // Keep acronyms and names as written; lowercase the rest after the first word.
  const label = kept.map((word, index) => (index > 0 && /^\p{Lu}\p{Ll}+$/u.test(word) ? word.toLowerCase() : word)).join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const band = (value: number | null, edges: [number, string][], none: string): string => {
  if (value === null) return none;
  for (const [floor, label] of edges) if (value >= floor) return label;
  return edges[edges.length - 1][1];
};

export const SOURCE_LABELS: Record<OutcomeSource, string> = {
  pasted: "Pasted postings",
  "find-jobs": "Find jobs",
  agent: "The job agent",
  startups: "Startups",
};

export type Dimension = {
  key: "fit" | "covered" | "keywords" | "role" | "source" | "tone" | "format";
  label: string;
  /** Which group a row is in; null leaves it out of this dimension. */
  group: (row: OutcomeRow) => string | null;
  /** How a group is shown, from one of its rows; the key itself by default. */
  name?: (row: OutcomeRow) => string;
  /** The group as the subject of a sentence: "Postings with a fit score of 85–100". */
  subject: (name: string) => string;
  /** The groups' order, when it has one (bands). */
  order?: string[];
};

const FIT_BANDS: [number, string][] = [[85, "85–100"], [70, "70–84"], [50, "50–69"], [0, "Under 50"]];
const SHARE_BANDS: [number, string][] = [[90, "90–100%"], [75, "75–89%"], [50, "50–74%"], [0, "Under 50%"]];

export const DIMENSIONS: Dimension[] = [
  {
    key: "fit",
    label: "Fit score",
    group: (row) => (row.fit === null ? null : band(row.fit, FIT_BANDS, "")),
    subject: (name) => `Postings with a fit score of ${name}`,
    order: FIT_BANDS.map(([, label]) => label),
  },
  {
    key: "covered",
    label: "Requirements you covered",
    group: (row) => (row.covered === null ? null : band(row.covered, SHARE_BANDS, "")),
    subject: (name) => `Applications where your profile covered ${name} of the requirements`,
    order: SHARE_BANDS.map(([, label]) => label),
  },
  {
    key: "keywords",
    label: "Posting keywords in your resume",
    group: (row) => (row.keywords === null ? null : band(row.keywords, SHARE_BANDS, "")),
    subject: (name) => `Resumes with ${name} of the posting's keywords`,
    order: SHARE_BANDS.map(([, label]) => label),
  },
  { key: "role", label: "Kind of role", group: (row) => roleFamily(row.role) || null, name: (row) => roleLabel(row.role), subject: (name) => `${name} roles` },
  {
    key: "source",
    label: "Where you found it",
    group: (row) => SOURCE_LABELS[row.source],
    subject: (name) => `Applications from ${name === "Pasted postings" ? "pasted postings" : name === "The job agent" ? "the job agent" : name}`,
  },
  {
    key: "tone",
    label: "Cover letter tone",
    group: (row) => row.tone.charAt(0) + row.tone.slice(1).toLowerCase(),
    subject: (name) => `Cover letters in a ${name.toLowerCase()} tone`,
  },
  { key: "format", label: "Resume format", group: (row) => row.format, subject: (name) => `${name} resumes` },
];

export type GroupStats = Rates & {
  key: string;
  /** How it's shown: "UX researcher" for the key "ux researcher". */
  name: string;
  /** Answer rate pulled towards the overall one, for ranking. */
  smoothedAnswerRate: number;
  /** Enough settled applications to say something. */
  enough: boolean;
  /** The applications in it. */
  ids: string[];
};

export type Breakdown = { dimension: Dimension["key"]; label: string; groups: GroupStats[] };

/** Each dimension's groups, with their rates, in band order or best first. */
export function breakdowns(rows: OutcomeRow[]): Breakdown[] {
  const base = rates(rows).answerRate ?? 0;
  return DIMENSIONS.map((dimension) => {
    const byGroup = new Map<string, OutcomeRow[]>();
    for (const row of rows) {
      const key = dimension.group(row);
      if (key) byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
    }
    const groups = [...byGroup].map(([key, members]): GroupStats => {
      const stats = rates(members);
      return {
        key,
        name: dimension.name?.(members[0]) ?? key,
        ...stats,
        smoothedAnswerRate: smoothed(stats.answered, stats.sent, base),
        enough: stats.sent >= MIN_GROUP,
        ids: members.map((member) => member.id),
      };
    });
    groups.sort(
      dimension.order
        ? (a, b) => dimension.order!.indexOf(a.key) - dimension.order!.indexOf(b.key)
        : (a, b) => b.smoothedAnswerRate - a.smoothedAnswerRate || b.sent - a.sent,
    );
    return { dimension: dimension.key, label: dimension.label, groups };
  }).filter((breakdown) => breakdown.groups.length > 0);
}

const percent = (rate: number) => `${Math.round(rate * 100)}%`;
const times = (count: number) => (count === 1 ? "once" : count === 2 ? "twice" : `${count} times`);

export type Insight = { tone: "good" | "bad"; text: string };

/** What stands out: groups with enough applications whose answer rate is well above or below the overall one. */
export function insights(rows: OutcomeRow[], limit = 4): Insight[] {
  const overall = rates(rows);
  if (overall.answerRate === null || overall.sent < MIN_GROUP * 2) return [];
  const base = overall.answerRate;
  const found: (Insight & { strength: number; ids: string })[] = [];
  for (const breakdown of breakdowns(rows)) {
    const dimension = DIMENSIONS.find((entry) => entry.key === breakdown.dimension)!;
    for (const group of breakdown.groups) {
      if (!group.enough || group.answerRate === null || group.sent === overall.sent) continue;
      const name = dimension.subject(group.name);
      const record = `were answered ${times(group.answered)} out of ${group.sent} (${percent(group.answerRate)}), against ${percent(base)} overall`;
      const ids = group.ids.toSorted().join(",");
      const strength = Math.abs(group.answerRate - base);
      // Well above: 20 points better, or half again as good when answers are rare.
      if (group.answered >= 2 && (group.answerRate - base >= 0.2 || group.answerRate >= base * 1.5)) {
        found.push({ tone: "good", text: `${name} ${record}.`, strength, ids });
      } else if (base >= 0.1 && (base - group.answerRate >= 0.2 || group.answerRate <= base * 0.5)) {
        found.push({ tone: "bad", text: `${name} ${group.answered === 0 ? `got no answer in ${group.sent} tries` : record}.`, strength, ids });
      }
    }
  }
  // The same applications seen from another side say nothing new: keep the first, strongest, one.
  const seen = new Set<string>();
  const unique = found
    .sort((a, b) => b.strength - a.strength)
    .filter((insight) => !seen.has(insight.ids) && seen.add(insight.ids));
  // What works and what doesn't, in turn, strongest first.
  const good = unique.filter((insight) => insight.tone === "good");
  const bad = unique.filter((insight) => insight.tone === "bad");
  const picked: Insight[] = [];
  while (picked.length < limit && (good.length > 0 || bad.length > 0)) {
    for (const list of [good, bad]) {
      const next = list.shift();
      if (next && picked.length < limit) picked.push({ tone: next.tone, text: next.text });
    }
  }
  return picked;
}

export type MinScoreSuggestion = {
  /** The minimum score to use. */
  score: number;
  /** Why, in a sentence with the numbers. */
  reason: string;
};

const THRESHOLDS = [50, 55, 60, 65, 70, 75, 80, 85];

/**
 * A better minimum fit score for the job agent, from what happened to scored
 * applications, or null when the evidence doesn't point anywhere else. Raises
 * it when applications below a score rarely got answers, lowers it when ones
 * just below the current minimum did as well as the rest.
 */
export function suggestMinScore(rows: OutcomeRow[], current: number): MinScoreSuggestion | null {
  const scored = rows.filter((row) => row.fit !== null);
  const overall = rates(scored);
  if (overall.answerRate === null || overall.answered === 0 || scored.length < MIN_GROUP * 2) return null;
  const base = overall.answerRate;

  // Raise: the most selective minimum such that the applications it would leave out (scored from the
  // current minimum up to it) rarely got answers, while those it keeps did.
  for (const threshold of THRESHOLDS.toReversed()) {
    if (threshold <= current) break;
    const dropped = rates(scored.filter((row) => row.fit! >= current && row.fit! < threshold));
    const kept = rates(scored.filter((row) => row.fit! >= threshold));
    if (dropped.sent >= MIN_GROUP && kept.sent >= 3 && kept.answered > 0 && (dropped.answerRate ?? 0) <= base * 0.35) {
      return {
        score: threshold,
        reason: `Applications scored ${current}–${threshold - 1} were answered ${times(dropped.answered)} out of ${dropped.sent}; from ${threshold} up, ${kept.answered} out of ${kept.sent}.`,
      };
    }
  }

  // Lower, by as little as the evidence allows: applications just under the current minimum did as well as the rest.
  for (const threshold of THRESHOLDS.toReversed()) {
    if (threshold >= current) continue;
    const near = rates(scored.filter((row) => row.fit! >= threshold && row.fit! < current));
    if (near.sent >= MIN_GROUP && near.answered >= 2 && (near.answerRate ?? 0) >= base) {
      return {
        score: threshold,
        reason: `Applications scored ${threshold}–${current - 1}, under your minimum, were answered ${near.answered} out of ${near.sent} times (${percent(near.answerRate!)}), as well as the rest.`,
      };
    }
  }
  return null;
}

export type Boost = {
  /** Points added to (or taken off) a posting's fit score for ranking, −10 to 10. */
  points: number;
  /** Why, for the screen; null with no boost. */
  reason: string | null;
};

/** The most a role family's track record moves a posting's rank. */
const MAX_BOOST = 10;
/** Points per unit of relative lift: twice the overall answer rate is worth +10 after smoothing pulls it back. */
const BOOST_SCALE = 15;

/**
 * How much a posting's kind of role has worked for this person: postings for
 * roles that got answers rank higher on the Agent screen, ones that never did
 * lower. Needs a few settled applications for the role first.
 */
export function roleBoost(role: string, rows: OutcomeRow[]): Boost {
  const family = roleFamily(role);
  const overall = rates(rows);
  if (!family || overall.answerRate === null || overall.sent < MIN_GROUP * 2) return { points: 0, reason: null };
  const members = rates(rows.filter((row) => roleFamily(row.role) === family));
  if (members.sent < 3) return { points: 0, reason: null };
  const base = overall.answerRate;
  const lift = (smoothed(members.answered, members.sent, base) - base) / Math.max(base, 0.1);
  const points = Math.max(-MAX_BOOST, Math.min(MAX_BOOST, Math.round(lift * BOOST_SCALE)));
  if (points === 0) return { points: 0, reason: null };
  const name = roleLabel(role);
  return {
    points,
    reason:
      points > 0
        ? `${name} roles have been answered ${members.answered} out of ${members.sent} times for you`
        : members.answered === 0
          ? `${name} roles haven't been answered in ${members.sent} tries`
          : `${name} roles have been answered only ${members.answered} out of ${members.sent} times`,
  };
}
