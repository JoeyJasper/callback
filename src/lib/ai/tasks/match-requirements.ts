import { z } from "zod";

import { matchSchema, type Evidence, type Extracted, type Match } from "@/lib/application-data";
import { citationText } from "@/lib/citation";
import { experienceMonths, factTexts, formatMonthYear, languageLevelLabel, resumePublications, sameName, type ProfileData } from "@/lib/profile";
import { mentions } from "@/lib/terms";

import { system, UNTRUSTED_POSTING, type Task } from "./prompt-parts";

export { mentions };

export const MATCH_REQUIREMENTS_VERSION = "match-requirements@2";

// The evidence matcher. The model says which profile skill or language each
// requirement is about, and which numbered lines of the profile show it is
// met. Code checks every answer against the profile (names must be the
// profile's own, line numbers must exist) and decides covered, partial or gap,
// so a model can't add a skill by misspelling one or cite a line that isn't
// there. When the model finds no line, code still looks for the requirement's
// own words in the profile, so what's written in a role counts even when it
// isn't in the skills list.

const answerSchema = z.object({
  matches: z.array(
    z.object({
      /** The requirement's number in the list. */
      requirement: z.number().int(),
      /** A skill from the profile's list, spelled as there, or null. */
      skill: z.string().nullable(),
      /** A language from the profile's list, or null. */
      language: z.string().nullable(),
      /** Numbers of the profile lines that show it, best first. Small models leave it out. */
      evidence: z.array(z.number().int()).nullable().default(null),
      /** "direct": the lines show the requirement itself; "related": similar work that carries over. */
      strength: z.enum(["direct", "related", "none"]).nullable().default(null),
    }),
  ),
});

const INSTRUCTIONS = `You compare a job's requirements with a candidate's profile, as JSON.

For each numbered requirement, answer:
- skill: which ONE of the candidate's skills it is about, if any. Copy names exactly as they appear in the candidate's list. Match on meaning ("Strong prototyping skills in Figma" is about "Figma"), but don't stretch: when no skill really fits, answer null.
- language: which of the candidate's languages it is about, if any.
- evidence: the numbers of up to three lines from the candidate's profile that show the requirement is met, best first. A line counts when it describes doing the thing the requirement asks for, even in other words ("Built and maintained the design system across six product teams" shows "Has built or maintained a design system"). Answer [] when no line shows it. Never cite a line for what it doesn't say.
- strength: "direct" when the lines show the requirement itself, "related" when they show similar work that would carry over, "none" when there are no lines.
Answer every requirement once.`;

export type MatchInput = { requirements: Extracted["requirements"]; profile: ProfileData; today?: Date };

/** A line of the profile that may back a requirement. */
export type ProfileLine = Evidence;

const MAX_EVIDENCE = 2;

/** Every line of the profile that can show a requirement is met, in a stable order: roles, projects, degrees, publications, facts, summary. */
export function profileLines(profile: ProfileData): ProfileLine[] {
  const split = (text: string) =>
    text
      .split("\n")
      .map((line) => line.replace(/^\s*[-*•·]\s*/, "").trim())
      .filter(Boolean);
  const lines: ProfileLine[] = [];
  for (const entry of profile.experience) {
    const label = [entry.role, entry.company].filter(Boolean).join(" at ") || "A role";
    for (const text of split(entry.bullets)) lines.push({ source: "experience", id: entry.id, label, text });
  }
  for (const entry of profile.projects) {
    for (const text of split(entry.bullets)) lines.push({ source: "project", id: entry.id, label: entry.name || "A project", text });
  }
  for (const entry of profile.education) {
    const label = [entry.degree, entry.school].filter(Boolean).join(", ") || "A degree";
    if (entry.degree.trim()) lines.push({ source: "education", id: entry.id, label, text: entry.degree.trim() });
    for (const text of split(entry.notes)) lines.push({ source: "education", id: entry.id, label, text });
  }
  for (const entry of resumePublications(profile.publications)) {
    lines.push({ source: "publication", id: entry.id, label: "A publication", text: citationText(entry.citation).trim() });
  }
  for (const text of factTexts(profile.facts)) lines.push({ source: "fact", id: "", label: "Facts about me", text });
  for (const text of split(profile.basics.summary)) lines.push({ source: "summary", id: "", label: "Your summary", text });
  return lines;
}

/** NEW-4 with evidence: each requirement covered, partial or a gap, with the profile's lines that show it. */
export const matchRequirements: Task<MatchInput, Match> = async (provider, { requirements, profile, today = new Date() }, { signal }) => {
  const lines = profileLines(profile);
  const needsModel = requirements.some((requirement) => requirement.kind !== "years");
  const answer = needsModel
    ? await provider.complete({
        system: system(INSTRUCTIONS, UNTRUSTED_POSTING),
        messages: [
          {
            role: "user",
            content: JSON.stringify(
              {
                requirements: requirements.map((requirement, index) => ({ number: index, text: requirement.text, kind: requirement.kind, skill: requirement.skill })),
                candidateSkills: profile.skills.map((skill) => skill.name),
                candidateLanguages: profile.languages.map((language) => language.name),
                candidateLines: lines.map((line, index) => ({ number: index, from: line.label, text: line.text })),
              },
              null,
              2,
            ),
          },
        ],
        schema: answerSchema,
        schemaName: "requirement_matches",
        creativity: "FAITHFUL",
        effort: "low",
        signal,
      })
    : { matches: [] };

  const mapped = new Map(answer.matches.map((match) => [match.requirement, match]));
  return {
    data: matchSchema.parse({
      items: requirements.map((requirement, index) => classify(requirement, mapped.get(index), profile, lines, today)),
    }),
    promptVersion: MATCH_REQUIREMENTS_VERSION,
  };
};

type Item = Match["items"][number];
type Mapped = z.infer<typeof answerSchema>["matches"][number];

/** The lines the model cited, if they exist, once each, best first. */
function citedLines(mapped: Mapped | undefined, lines: ProfileLine[]): ProfileLine[] {
  const numbers = [...new Set(mapped?.evidence ?? [])].filter((number) => number >= 0 && number < lines.length);
  return numbers.map((number) => lines[number]);
}

/** Lines that name the requirement's skill or keywords outright, found without the model. */
function namedIn(requirement: Extracted["requirements"][number], skill: string | null, lines: ProfileLine[]): ProfileLine[] {
  const terms = [skill, requirement.skill, ...(requirement.keywords ?? [])].filter((term): term is string => Boolean(term?.trim()));
  // Single short words ("Go", "R") match too much prose to count as proof.
  const usable = terms.filter((term) => term.trim().length >= 3 || /[+#]/.test(term));
  // Only work counts as proof found this way: "I'd like to do more user research" in a fact names it without showing it.
  const work = lines.filter((line) => line.source !== "fact" && line.source !== "summary");
  return work.filter((line) => usable.some((term) => mentions(line.text, term)));
}

/** Where the evidence is from, for the note: "Shown in your work at Northwind Logistics". */
function shownIn(evidence: ProfileLine[], profile: ProfileData): string {
  const first = evidence[0];
  if (first.source === "experience") {
    const entry = profile.experience.find((role) => role.id === first.id);
    return `Shown in your work${entry?.company ? ` at ${entry.company}` : entry?.role ? ` as ${entry.role}` : ""}`;
  }
  if (first.source === "project") return `Shown in your ${first.label} project`;
  if (first.source === "education") return `Shown in your studies (${first.label})`;
  if (first.source === "publication") return "Shown in your publications";
  return first.source === "fact" ? "From what you told me about yourself" : "From your summary";
}

const roleIds = (evidence: ProfileLine[]) => [...new Set(evidence.filter((line) => line.source === "experience").map((line) => line.id))];

function classify(
  requirement: Extracted["requirements"][number],
  mapped: Mapped | undefined,
  profile: ProfileData,
  lines: ProfileLine[],
  today: Date,
): Item {
  const base = { requirement: requirement.text, skill: null, experienceIds: [] as string[], note: null };

  if (requirement.kind === "years") {
    const dated = profile.experience.filter((entry) => entry.startYear !== null);
    if (dated.length === 0) return { ...base, result: "gap", note: "Add your experience to check this" };
    const first = dated.reduce((earliest, entry) =>
      entry.startYear! * 12 + (entry.startMonth ?? 1) < earliest.startYear! * 12 + (earliest.startMonth ?? 1) ? entry : earliest,
    );
    const count = profile.experience.length;
    const roles = `${count} ${count === 1 ? "role" : "roles"} in your profile, since ${formatMonthYear(first.startYear, first.startMonth)}`;
    const years = Math.floor(experienceMonths(profile, today) / 12);
    return years >= (requirement.years ?? 0)
      ? { ...base, result: "covered", note: roles }
      : { ...base, result: "gap", note: `${roles} (about ${years} ${years === 1 ? "year" : "years"})` };
  }

  // Names must be the profile's own: a model can't add a skill by misspelling one.
  const language = profile.languages.find(
    (entry) => (mapped?.language && sameName(entry.name, mapped.language)) || (requirement.language && sameName(entry.name, requirement.language)),
  );
  if (requirement.kind === "language" || (language && !mapped?.skill)) {
    return language
      ? { ...base, result: "covered", skill: language.name, note: `${language.name}: ${languageLevelLabel(language.level)}` }
      : { ...base, result: "gap", note: "Not in your profile" };
  }

  // The model's pick first, then the skill the posting names; spelling may differ a little.
  const skill =
    profile.skills.find((entry) => mapped?.skill && sameSkill(entry.name, mapped.skill)) ??
    profile.skills.find((entry) => requirement.skill && sameSkill(entry.name, requirement.skill));

  // The lines that show it: the model's, checked, then any that name it outright.
  const cited = citedLines(mapped, lines);
  const named = namedIn(requirement, skill?.name ?? null, lines);
  const direct = mapped?.strength === "related" ? named : [...cited, ...named];
  const evidence = [...new Set(direct)].slice(0, MAX_EVIDENCE);
  const related = mapped?.strength === "related" ? cited.slice(0, MAX_EVIDENCE) : [];

  if (skill) {
    const roles = profile.experience.filter((entry) => entry.skillIds.includes(skill.id));
    if (roles.length > 0) {
      return {
        ...base,
        result: "covered",
        skill: skill.name,
        experienceIds: [...new Set([...roles.map((entry) => entry.id), ...roleIds(evidence)])],
        note: `Used at ${[...new Set(roles.map((entry) => entry.company || entry.role))].join(", ")}`,
        ...(evidence.length > 0 ? { evidence } : {}),
      };
    }
  }
  if (evidence.length > 0) {
    return { ...base, result: "covered", skill: skill?.name ?? null, experienceIds: roleIds(evidence), note: shownIn(evidence, profile), evidence };
  }
  if (skill) return { ...base, result: "partial", skill: skill.name, note: "In your skills, but not linked to a role yet" };
  if (related.length > 0) {
    return {
      ...base,
      result: "partial",
      experienceIds: roleIds(related),
      note: `Related: ${shownIn(related, profile).replace(/^Shown in /, "").replace(/^From /, "")}. Say how it carries over.`,
      evidence: related,
    };
  }
  return {
    ...base,
    result: "gap",
    note: requirement.kind === "skill" ? "Not in your profile yet" : "Nothing in your profile, so I'll address it honestly in the letter",
  };
}

/**
 * Whether two skill names mean the same skill, forgiving case, punctuation
 * and a plural: "Design system" is "Design systems", "UX-research" is "UX research".
 */
export function sameSkill(a: string, b: string): boolean {
  const key = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(" ")
      .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
      .join(" ");
  return key(a) === key(b);
}
