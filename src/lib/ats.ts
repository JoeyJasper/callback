import type { Match, Requirement, Unit } from "@/lib/application-data";
import { citationText } from "@/lib/citation";
import { documentLabels, type DocumentLabels } from "@/lib/document-labels";
import type { ProfileData } from "@/lib/profile";
import { resumeContent, type ResumeContent } from "@/lib/resume-content";
import { indexOfWords, mentions, words } from "@/lib/terms";

// The ATS check: what an applicant tracking system would find in a tailored
// resume before anyone reads it. Two parts:
//
// - Keyword coverage: for each of the posting's requirements, whether the
//   posting's own terms for it are in the resume's text. A term that's
//   missing but the profile shows is worth adding; one the profile doesn't
//   show stays out (the resume never claims what isn't there).
// - Read-back: the text the PDF actually gives a parser, compared with what
//   the resume says, to catch layouts that scramble it.

/** Everything the resume shows as text, in reading order. */
export function resumeText(content: ResumeContent): string {
  return [
    content.name,
    content.headline,
    ...content.contacts,
    content.summary,
    ...content.experience.flatMap((role) => [role.role, role.company, role.dates, ...role.bullets, role.skills.join(", ")]),
    ...content.projects.flatMap((project) => [project.name, project.link, project.dates, ...project.bullets, project.skills.join(", ")]),
    ...content.education.flatMap((entry) => [entry.degree, entry.school, entry.dates, entry.notes]),
    ...content.publications.map((entry) => citationText(entry.citation)),
    content.skills,
    content.languages,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * found: one of its terms is in the resume. addable: none is, but the profile
 * shows the requirement, so the term can go in honestly. gap: neither.
 */
export type TermStatus = "found" | "addable" | "gap";

export type TermCheck = {
  requirement: string;
  mustHave: boolean;
  /** The posting's words for it, as an ATS would search them. */
  terms: string[];
  /** The term the resume has, or null. */
  found: string | null;
  status: TermStatus;
};

export type Coverage = {
  /** Required terms found, as a percentage; null when the posting names none to check. */
  score: number | null;
  /** Required ones checked, and found. */
  required: { found: number; total: number };
  /** Required ones the profile shows but the resume doesn't name: what adding would win. */
  addable: number;
  items: TermCheck[];
};

/** The keyword coverage of a tailored resume as it stands, for the tab and its label. */
export function resumeCoverage({
  profile,
  units,
  language,
  includeReferences,
  showPhoto,
  requirements,
  match,
}: {
  profile: ProfileData;
  units: Unit[];
  language: string;
  includeReferences: boolean;
  showPhoto: boolean | null;
  requirements: Requirement[];
  match: Match | null;
}): Coverage {
  const content = resumeContent(profile, { units, includeReferences, showPhoto }, documentLabels(language));
  return keywordCoverage(resumeText(content), requirements, match);
}

/** The words an ATS would search for this requirement: the posting's own, else the skill or language it names. */
export function searchTerms(requirement: Requirement): string[] {
  if (requirement.kind === "years") return [];
  const own = (requirement.keywords ?? []).map((term) => term.trim()).filter(Boolean);
  if (own.length > 0) return own;
  return [requirement.skill, requirement.language].filter((term): term is string => Boolean(term?.trim())).map((term) => term.trim());
}

/** Keyword coverage of a resume's text against the posting's requirements, in the requirements' order. */
export function keywordCoverage(text: string, requirements: Requirement[], match: Match | null): Coverage {
  const items: TermCheck[] = [];
  requirements.forEach((requirement, index) => {
    const terms = searchTerms(requirement);
    if (terms.length === 0) return;
    const found = terms.find((term) => mentions(text, term)) ?? null;
    const shown = match?.items[index] && match.items[index].result !== "gap";
    items.push({
      requirement: requirement.text,
      mustHave: requirement.mustHave !== false,
      terms,
      found,
      status: found ? "found" : shown ? "addable" : "gap",
    });
  });
  const required = items.filter((item) => item.mustHave);
  const foundCount = required.filter((item) => item.status === "found").length;
  return {
    score: required.length > 0 ? Math.round((foundCount / required.length) * 100) : null,
    required: { found: foundCount, total: required.length },
    addable: required.filter((item) => item.status === "addable").length,
    items,
  };
}

/** What the resume should read back as, worked out from what it shows. */
export type Expected = {
  name: string;
  email: string;
  phone: string;
  /** Section headings, in reading order. */
  headings: string[];
  /** Each role's title and company. */
  entries: { title: string; at: string }[];
  /** Bullets and other lines that should come out whole. */
  lines: string[];
};

export type ParseIssue = {
  severity: "error" | "warning";
  /** What's wrong, in plain words. */
  message: string;
  /** What to do about it. */
  fix: string;
};

export type ParseResult = {
  /** 0–100: how cleanly a parser reads the PDF. */
  score: number;
  /** Lines that came out in one piece, out of those checked. */
  intact: { count: number; total: number };
  /** Share of the resume's words found in the PDF's text, 0–1. */
  recovered: number;
  issues: ParseIssue[];
};

const digits = (text: string) => text.replace(/\D/g, "");

/** "P R O F I L E" for a heading, to show what letter spacing does. */
const heading0 = (headings: string[]) => [...headings[0].toUpperCase()].join(" ");

/** Characters a parser stumbles on: unmapped glyphs, ligatures and the private use area. */
const ODD_CHARACTERS = /[\uFFFD\uFB00-\uFB06\uE000-\uF8FF]/u;

/**
 * Compares the text a PDF gives a parser with what the resume shows. `layout`
 * says whether the resume used a sidebar, for advice on fixing it.
 */
export function readBack(pdfText: string, expected: Expected, { sidebar }: { sidebar: boolean }): ParseResult {
  const issues: ParseIssue[] = [];
  const tokens = words(pdfText);
  const letters = pdfText.replace(/[^\p{L}]/gu, "").length;
  const layoutFix = sidebar
    ? "Turn off “Sidebar layout” above the resume, or pick a one-column theme."
    : "Pick a one-column theme without a timeline column.";

  if (letters < 50) {
    return {
      score: 0,
      intact: { count: 0, total: expected.lines.length },
      recovered: 0,
      issues: [
        {
          severity: "error",
          message: "The PDF has no text a parser can read, so the system sees an empty resume.",
          fix: "Pick a different theme and download it again; if it keeps happening, report it.",
        },
      ],
    };
  }

  if (expected.name && !mentions(pdfText, expected.name)) {
    issues.push({ severity: "error", message: "Your name doesn't come out of the PDF as text.", fix: layoutFix });
  }
  if (expected.email && !pdfText.toLowerCase().replace(/\s+/g, "").includes(expected.email.toLowerCase().replace(/\s+/g, ""))) {
    issues.push({
      severity: "error",
      message: "Your email address doesn't come out of the PDF whole, so the system may not be able to reach you.",
      fix: layoutFix,
    });
  }
  if (expected.phone && digits(expected.phone).length >= 6 && !digits(pdfText).includes(digits(expected.phone))) {
    issues.push({ severity: "warning", message: "Your phone number doesn't come out of the PDF whole.", fix: layoutFix });
  }

  // Headings split a resume into sections for the parser; out of order, sections get mixed up.
  // A heading counts on a line of its own. Text without line breaks falls back to finding the words anywhere.
  const pdfLines = pdfText.split(/\r?\n/).map((line) => words(line).join(" "));
  const byLine = pdfLines.filter(Boolean).length >= 5;
  const squeezed = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  const findHeading = (heading: string, from: number): number => {
    const needle = words(heading);
    if (!byLine) return indexOfWords(tokens, needle, from);
    // On a line of its own, or starting one: side-heading layouts put the heading before the section's first line.
    const wanted = needle.join(" ");
    return pdfLines.findIndex((line, index) => index >= from && (line === wanted || line.startsWith(`${wanted} `)));
  };
  // "P R O F I L E": letter-spaced, a parser reads single letters.
  const spacedOut = byLine
    ? expected.headings.filter((heading) =>
        pdfText.split(/\r?\n/).some((line) => squeezed(line) === squeezed(heading) && /(?:\p{L} ){3,}/u.test(line.trim())),
      )
    : [];
  let position = 0;
  const missing: string[] = [];
  let outOfOrder = false;
  for (const heading of expected.headings) {
    if (spacedOut.includes(heading)) continue;
    const at = findHeading(heading, position);
    if (at === -1) {
      if (findHeading(heading, 0) === -1) missing.push(heading);
      else outOfOrder = true;
    } else {
      position = at + 1;
    }
  }
  if (spacedOut.length > 0) {
    issues.push({
      severity: "warning",
      message: `${spacedOut.length === 1 ? "The heading" : "The headings"} ${spacedOut.map((heading) => `“${heading}”`).join(", ")} ${spacedOut.length === 1 ? "comes" : "come"} out letter by letter (“${heading0(spacedOut)}”), so the system can't tell where sections start.`,
      fix: "Pick a theme whose headings aren't spaced out, such as one with underlined or plain headings.",
    });
  }
  if (missing.length > 0) {
    issues.push({
      severity: "warning",
      message: `${missing.length === 1 ? "The heading" : "The headings"} ${missing.map((heading) => `“${heading}”`).join(", ")} ${missing.length === 1 ? "doesn't" : "don't"} come out as text, so the system can't tell where ${missing.length === 1 ? "that section starts" : "those sections start"}.`,
      fix: layoutFix,
    });
  }
  if (outOfOrder) {
    issues.push({
      severity: "warning",
      message: "The sections come out in a different order than they're shown, which can put text under the wrong heading.",
      fix: layoutFix,
    });
  }

  const lostEntries = expected.entries.filter((entry) => (entry.title && !mentions(pdfText, entry.title)) || (entry.at && !mentions(pdfText, entry.at)));
  if (lostEntries.length > 0) {
    issues.push({
      severity: "warning",
      message: `Job titles or employers don't come out cleanly for ${lostEntries.map((entry) => [entry.title, entry.at].filter(Boolean).join(" at ")).join("; ")}.`,
      fix: layoutFix,
    });
  }

  // A line split up or mixed with its neighbour is how columns scramble text.
  const checkable = expected.lines.map(words).filter((line) => line.length >= 4);
  const intact = checkable.filter((line) => indexOfWords(tokens, line) !== -1).length;
  const share = checkable.length > 0 ? intact / checkable.length : 1;
  if (share < 0.8) {
    issues.push({
      severity: "error",
      message: `Only ${intact} of ${checkable.length} lines come out in one piece: the layout breaks lines apart or mixes columns, and a parser reads scrambled text.`,
      fix: layoutFix,
    });
  } else if (share < 0.95) {
    issues.push({
      severity: "warning",
      message: `${checkable.length - intact} of ${checkable.length} lines don't come out in one piece.`,
      fix: layoutFix,
    });
  }

  const expectedWords = new Set(expected.lines.flatMap(words));
  const present = new Set(tokens);
  const recovered = expectedWords.size > 0 ? [...expectedWords].filter((word) => present.has(word)).length / expectedWords.size : 1;
  if (recovered < 0.9) {
    issues.push({
      severity: "warning",
      message: `About ${Math.round((1 - recovered) * 100)}% of your resume's words don't come out of the PDF as text.`,
      fix: "Pick a theme with a standard font, and avoid text in images.",
    });
  }

  const odd = pdfText.match(new RegExp(`\\S*${ODD_CHARACTERS.source}\\S*`, "u"));
  if (odd) {
    const sample = odd[0].replace(new RegExp(ODD_CHARACTERS.source, "gu"), "□").slice(0, 40);
    issues.push({
      severity: "warning",
      message: `Some characters come out as symbols a parser can't read, e.g. “${sample}”.`,
      fix: "Pick a theme with a different font.",
    });
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return {
    score: Math.max(0, 100 - errors * 30 - warnings * 10),
    intact: { count: intact, total: checkable.length },
    recovered,
    issues,
  };
}

/**
 * The section headings a resume prints, in reading order: the same sections
 * and columns as ResumeDocument draws.
 */
export function printedHeadings(
  content: ResumeContent,
  labels: Pick<DocumentLabels, "profile" | "experience" | "projects" | "education" | "publications" | "references" | "contact" | "skills" | "languages">,
  layout: { split: boolean; sidebarEnd: boolean },
): string[] {
  const main = [
    content.summary && labels.profile,
    content.experience.length > 0 && labels.experience,
    content.projects.length > 0 && labels.projects,
    content.education.length > 0 && labels.education,
    content.publications.length > 0 && labels.publications,
    content.references.length > 0 && labels.references,
  ];
  const sidebar = [layout.split && content.contacts.length > 0 && labels.contact, content.skills && labels.skills, content.languages && labels.languages];
  const ordered = !layout.split || layout.sidebarEnd ? [...main, ...sidebar] : [...sidebar, ...main];
  return ordered.filter((heading): heading is string => Boolean(heading));
}

/** What a resume should read back as, from what it shows and the headings it prints. */
export function expectedFrom(content: ResumeContent, headings: string[], basics: { email: string; phone: string }): Expected {
  return {
    name: content.name,
    email: basics.email.trim(),
    phone: basics.phone.trim(),
    headings,
    entries: content.experience.map((role) => ({ title: role.role, at: role.company })),
    lines: [
      ...content.summary.split(/(?<=[.!?])\s+/),
      ...content.experience.flatMap((role) => role.bullets),
      ...content.projects.flatMap((project) => project.bullets),
    ]
      .map((line) => line.trim())
      .filter(Boolean),
  };
}
