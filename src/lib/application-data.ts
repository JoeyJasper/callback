import { z } from "zod";

import { DocumentKind } from "@/generated/prisma/enums";

// Schemas for the JSON columns of Application, Document and ChatMessage
// (prisma/schema.prisma). The AI tasks (src/lib/ai/tasks) produce these
// shapes. Parse a column with `schema.parse(row.column)` when reading it.

/**
 * A part of a tailored document that can be edited, regenerated or refined
 * on its own (APP-4). Ids are stable: "summary", "skills", "languages",
 * "experience:<experience id>", "education:<education id>" in a resume, and
 * "paragraph:1", "paragraph:2"… and "sign-off" in a cover letter.
 */
export const unitSchema = z.object({
  id: z.string().min(1),
  /** Shown on the unit's toolbar and the chat target, e.g. "Summary" or "Northwind Logistics role". */
  label: z.string(),
  text: z.string(),
  /**
   * Names, numbers or credentials the fact guard (E6-6) couldn't find in the
   * profile or the posting, shown as "check this" (E8-3). Absent when fine.
   */
  unverified: z.array(z.string()).optional(),
});
export type Unit = z.infer<typeof unitSchema>;

/** The cover letter's closing line ("Warm regards,"), kept as a unit so it can be edited. */
export const SIGN_OFF_UNIT = "sign-off";

/** Document.units: the document's units in reading order. */
export const unitsSchema = z
  .array(unitSchema)
  .refine((units) => new Set(units.map((unit) => unit.id)).size === units.length, {
    error: "Unit ids must be unique.",
  });

/**
 * One thing the posting asks for, typed so matching can be checked in code
 * (E6-5): a skill, an amount of experience, a spoken language or anything else.
 */
export const requirementSchema = z.object({
  /** In the posting's words, shortened, e.g. "5+ years of product design". */
  text: z.string(),
  kind: z.enum(["skill", "years", "language", "other"]),
  /** For a skill: its short name, e.g. "Figma". */
  skill: z.string().nullable(),
  /** For an amount of experience: the years asked for. */
  years: z.number().nullable(),
  /** For a spoken language: its English name, e.g. "Dutch". */
  language: z.string().nullable(),
  /**
   * Whether the posting treats it as required rather than a plus. Absent on
   * postings read before this was asked for, which counts as required.
   */
  mustHave: z.boolean().optional(),
  /**
   * The exact words from the posting an applicant tracking system would look
   * for, e.g. ["Figma", "prototyping"]. Absent on older postings.
   */
  keywords: z.array(z.string()).optional(),
});
export type Requirement = z.infer<typeof requirementSchema>;

/** Application.extracted: what the AI read from the posting (NEW-3). Missing fields are null. */
export const extractedSchema = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  location: z.string().nullable(),
  mode: z.string().nullable(),
  salary: z.string().nullable(),
  /** "2026-10-15" */
  deadline: z.iso.date().nullable(),
  requirements: z.array(requirementSchema),
  /** Whether the posting asks for references (SET-9: include them only then). */
  asksForReferences: z.boolean(),
  /** The posting's language, e.g. "English", for "Write documents in: the posting's language". */
  language: z.string().nullable(),
});
export type Extracted = z.infer<typeof extractedSchema>;

/**
 * What was read from an application's posting, for a prompt. Rows from
 * before the current schema fall back to the application's own details.
 */
export function extractedOf(application: {
  extracted: unknown;
  title: string;
  company: string;
  role: string;
  location: string;
  mode: string;
  salary: string;
  language: string;
}): Extracted {
  const parsed = extractedSchema.safeParse(application.extracted);
  if (parsed.success) return parsed.data;
  const orNull = (value: string) => value.trim() || null;
  return {
    title: orNull(application.title),
    company: orNull(application.company),
    role: orNull(application.role),
    location: orNull(application.location),
    mode: orNull(application.mode),
    salary: orNull(application.salary),
    deadline: null,
    requirements: [],
    asksForReferences: false,
    language: orNull(application.language),
  };
}

/**
 * How a requirement matches the profile (NEW-4): covered (the skill is used in
 * a role, or a line of the profile shows it), partial (the skill is in the
 * profile but not attached to a role, or only related work shows) or gap
 * (nothing in the profile).
 */
export const matchResults = ["covered", "partial", "gap"] as const;
export type MatchResult = (typeof matchResults)[number];

/** Where in the profile a line of evidence comes from. */
export const evidenceSources = ["experience", "project", "education", "publication", "fact", "summary"] as const;
export type EvidenceSource = (typeof evidenceSources)[number];

/**
 * A line of the profile that shows a requirement is met, quoted word for word
 * from the profile (the evidence matcher), so the user can check it.
 */
export const evidenceSchema = z.object({
  source: z.enum(evidenceSources),
  /** The role, project or degree's id; "" for a fact or the summary. */
  id: z.string(),
  /** Where it's from, e.g. "Senior Product Designer at Northwind Logistics". */
  label: z.string(),
  /** The profile's own line. */
  text: z.string(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const matchItemSchema = z.object({
  requirement: z.string(),
  result: z.enum(matchResults),
  /** The profile skill or language the requirement maps to, if any. */
  skill: z.string().nullable(),
  /** The roles where that skill was used, or where the evidence is from. */
  experienceIds: z.array(z.string()),
  /** A short explanation, e.g. "Nothing in your profile, so I'll address it honestly in the letter". */
  note: z.string().nullable(),
  /** The profile's lines that show it, best first. Absent on matches made before evidence. */
  evidence: z.array(evidenceSchema).optional(),
});

/** Application.match */
export const matchSchema = z.object({ items: z.array(matchItemSchema) });
export type Match = z.infer<typeof matchSchema>;

/** A gap after its skill was added to the profile (NEW-5): in the profile, not yet used in a role. */
export function withSkillAdded(item: Match["items"][number], skill: string): Match["items"][number] {
  // Already shown by a line of the profile: adding the skill only names it.
  if (item.result === "covered") return { ...item, skill };
  return { ...item, result: "partial", skill, note: "In your skills, but not linked to a role yet" };
}

/** "5/7 match": requirements that are covered or partly covered, out of all of them. */
export function matchScore(match: Match): { hit: number; total: number } {
  return {
    hit: match.items.filter((item) => item.result !== "gap").length,
    total: match.items.length,
  };
}

/** A STAR answer (situation, task, action, result), from the candidate's own experience. */
export const starSchema = z.object({ situation: z.string(), task: z.string(), action: z.string(), result: z.string() });

/**
 * Application.interviewPrep: the interview prep pack, written from the
 * profile and the posting. `unverified` lists what the fact guard couldn't
 * find in either, as on documents (E6-6).
 */
export const interviewPrepSchema = z.object({
  /** "Tell me about yourself": about a minute, in the first person. */
  pitch: z.string(),
  pitchUnverified: z.array(z.string()).optional(),
  questions: z.array(
    z.object({
      question: z.string(),
      /** What the interviewer is checking with it. */
      why: z.string(),
      answer: starSchema,
      /** The role or project the story is from, e.g. "Senior Product Designer at Northwind Logistics". */
      from: z.string(),
      unverified: z.array(z.string()).optional(),
    }),
  ),
  /** The requirements the profile doesn't cover, and how to talk about each honestly. */
  gaps: z.array(z.object({ requirement: z.string(), approach: z.string(), unverified: z.array(z.string()).optional() })),
  /** Questions to ask the interviewer, specific to this job. */
  askThem: z.array(z.string()),
});
export type InterviewPrep = z.infer<typeof interviewPrepSchema>;

/** One unit change made from the chat, with the text it replaced so it can be undone (APP-8). */
export const unitEditSchema = z.object({
  document: z.enum(DocumentKind),
  unitId: z.string().min(1),
  text: z.string(),
  previousText: z.string(),
  /** What the fact guard couldn't back in the new text (E6-6). */
  unverified: z.array(z.string()).optional(),
  /** The fact guard's hints on the text it replaced, which Undo brings back. */
  previousUnverified: z.array(z.string()).optional(),
});

/**
 * Document.trimmed (E10-10): what was left out of a tailored resume to fit
 * its page limit, or by hand with "Leave out" (#217), so it can be put back.
 * A whole part goes back where it was; bullets go back at the end of their role.
 */
export const trimmedSchema = z.array(
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("unit"),
      unit: unitSchema,
      index: z.number().int().min(0),
      /** Left out with "Leave out", not to fit the page limit. */
      byHand: z.literal(true).optional(),
    }),
    z.object({ kind: z.literal("bullets"), unitId: z.string().min(1), label: z.string(), lines: z.array(z.string()).min(1) }),
  ]),
);
export type Trimmed = z.infer<typeof trimmedSchema>;

/** ChatMessage.edits */
export const editsSchema = z.array(unitEditSchema);
export type UnitEdit = z.infer<typeof unitEditSchema>;
