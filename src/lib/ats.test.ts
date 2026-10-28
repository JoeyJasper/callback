import { describe, expect, it } from "vitest";

import type { Match, Requirement } from "@/lib/application-data";
import { demoProfile, demoResumeUnits } from "@/lib/demo-profile";
import { ENGLISH_LABELS } from "@/lib/document-labels";
import { resumeContent } from "@/lib/resume-content";

import { expectedFrom, keywordCoverage, printedHeadings, readBack, resumeText, searchTerms } from "./ats";

const requirement = (text: string, extra: Partial<Requirement> = {}): Requirement => ({
  text,
  kind: "skill",
  skill: null,
  years: null,
  language: null,
  ...extra,
});

const profile = demoProfile();
const content = resumeContent(profile, { units: demoResumeUnits() }, ENGLISH_LABELS);
const text = resumeText(content);

describe("keyword coverage", () => {
  const requirements = [
    requirement("5+ years of product design", { kind: "years", years: 5 }),
    requirement("Strong prototyping skills in Figma", { skill: "Figma", keywords: ["Figma", "prototyping"] }),
    requirement("Stakeholder management", { skill: "Stakeholder management", keywords: ["stakeholder management"] }),
    requirement("Accessibility know-how (WCAG 2.2)", { skill: "Accessibility", keywords: ["WCAG", "accessibility"] }),
    requirement("Dutch is a plus", { kind: "language", language: "Dutch", mustHave: false }),
    requirement("Payments experience", { kind: "other" }),
  ];
  const match: Match = {
    items: requirements.map((entry, index) => ({
      requirement: entry.text,
      // The profile shows stakeholder work (say, in a bullet) but the resume doesn't use the word.
      result: index === 3 || index === 5 ? "gap" : "covered",
      skill: null,
      experienceIds: [],
      note: null,
    })),
  };

  it("checks the posting's own terms, falls back to the skill or language, and skips what has no words to search", () => {
    expect(searchTerms(requirements[0])).toEqual([]);
    expect(searchTerms(requirements[1])).toEqual(["Figma", "prototyping"]);
    expect(searchTerms(requirement("Figma", { skill: " Figma " }))).toEqual(["Figma"]);
    expect(searchTerms(requirements[4])).toEqual(["Dutch"]);
    expect(searchTerms(requirements[5])).toEqual([]);
  });

  it("scores required terms found, and tells addable terms the profile backs from real gaps", () => {
    const coverage = keywordCoverage(text, requirements, match);
    expect(coverage.items.map((item) => [item.requirement, item.status, item.found])).toEqual([
      ["Strong prototyping skills in Figma", "found", "Figma"],
      ["Stakeholder management", "addable", null],
      ["Accessibility know-how (WCAG 2.2)", "gap", null],
      ["Dutch is a plus", "found", "Dutch"],
    ]);
    expect(coverage.items[3].mustHave).toBe(false);
    // Three required to check (Figma, stakeholder management, accessibility), one found.
    expect(coverage.required).toEqual({ found: 1, total: 3 });
    expect(coverage.score).toBe(33);
    expect(coverage.addable).toBe(1);
  });

  it("has no score when the posting names nothing to look for", () => {
    expect(keywordCoverage(text, [requirements[0], requirements[5]], null)).toMatchObject({ score: null, items: [], addable: 0 });
  });

  it("reads the resume's text from what it shows: titles, companies, bullets, skills and languages", () => {
    expect(text).toContain("Jane Doe");
    expect(text).toContain("Northwind Logistics");
    expect(text).toContain("Figma");
    expect(text).toMatch(/Dutch/);
  });
});

describe("the PDF read-back", () => {
  const headings = printedHeadings(content, ENGLISH_LABELS, { split: false, sidebarEnd: false });
  const expected = expectedFrom(content, headings, profile.basics);
  // What a clean single-column PDF gives a parser: everything, in order, with line breaks where it wrapped.
  const clean = [
    content.name,
    content.headline,
    content.contacts.join(" · "),
    "Profile",
    content.summary,
    "Experience",
    ...content.experience.flatMap((role) => [`${role.role}, ${role.company}`, role.dates, ...role.bullets.map((bullet) => `• ${bullet.replace(/ (\S+ \S+)$/, "\n$1")}`)]),
    "Projects",
    ...content.projects.flatMap((project) => [project.name, ...project.bullets]),
    "Education",
    ...content.education.flatMap((entry) => [entry.degree, entry.school, entry.notes]),
    "Publications",
    ...content.publications.map((entry) => entry.citation.replace(/\*/g, "")),
    "Skills",
    content.skills,
    "Languages",
    content.languages,
  ].join("\n");

  it("lists the headings a resume prints in its reading order, sidebar first in a split layout", () => {
    expect(headings).toEqual(["Profile", "Experience", "Projects", "Education", "Publications", "Skills", "Languages"]);
    expect(printedHeadings(content, ENGLISH_LABELS, { split: true, sidebarEnd: false })).toEqual(["Contact", "Skills", "Languages", "Profile", "Experience", "Projects", "Education", "Publications"]);
    expect(printedHeadings(content, ENGLISH_LABELS, { split: true, sidebarEnd: true }).at(-1)).toBe("Languages");
  });

  it("passes a PDF that reads back cleanly", () => {
    const result = readBack(clean, expected, { sidebar: false });
    expect(result.issues).toEqual([]);
    expect(result.score).toBe(100);
    expect(result.intact.count).toBe(result.intact.total);
    expect(result.recovered).toBe(1);
  });

  it("calls out scrambled columns, a lost email and headings out of order, with a fix for sidebar layouts", () => {
    // Two columns read across: each line of one column followed by a line of the other.
    const lines = clean.split("\n");
    const half = Math.ceil(lines.length / 2);
    const interleaved = lines
      .slice(0, half)
      .flatMap((line, index) => [line.split(" ").slice(0, 3).join(" "), lines[half + index] ?? "", line.split(" ").slice(3).join(" ")])
      .join("\n")
      .replace(profile.basics.email, "jane.doe@ example");
    const result = readBack(interleaved, expected, { sidebar: true });
    const messages = result.issues.map((issue) => issue.message).join("\n");
    expect(messages).toMatch(/email address doesn't come out of the PDF whole/);
    expect(messages).toMatch(/lines come out in one piece/);
    expect(result.issues.every((issue) => issue.fix.length > 0)).toBe(true);
    expect(result.issues.find((issue) => issue.severity === "error")?.fix).toMatch(/Turn off “Sidebar layout”/);
    expect(result.score).toBeLessThan(50);
  });

  it("notices headings that don't come out, sections out of order, spaced-out headings, missing roles and odd characters", () => {
    const languages = `Languages\n${content.languages}`;
    const shuffled = clean
      // "Projects" also appears in a bullet ("web projects"), which doesn't count as the heading.
      .replace("\nProjects\n", "\n")
      .replace(`\n${languages}`, "")
      .replace("\nSkills\n", "\nS K I L L S\n")
      .replaceAll("Northwind Logistics", "Northw ind Logistics")
      .replace("Rotterdam", "Ro\uE009erdam");
    const result = readBack(`${languages}\n${shuffled}`, expected, { sidebar: false });
    const messages = result.issues.map((issue) => issue.message);
    expect(messages).toContainEqual(expect.stringMatching(/The heading “Projects” doesn't come out as text/));
    expect(messages).toContainEqual(expect.stringMatching(/different order/));
    expect(messages).toContainEqual("The heading “Skills” comes out letter by letter (“S K I L L S”), so the system can't tell where sections start.");
    expect(messages).toContainEqual(expect.stringMatching(/Northwind Logistics/));
    expect(messages).toContainEqual(expect.stringMatching(/symbols a parser can't read, e\.g\. “Ro□erdam,?”/));
    expect(result.issues.find((issue) => /letter by letter/.test(issue.message))?.fix).toMatch(/aren't spaced out/);
    expect(result.issues[result.issues.length - 1].fix).toBe("Pick a theme with a different font.");
  });

  it("finds headings by their words when the text has no line breaks", () => {
    const flat = clean.replace(/\n/g, " ");
    expect(readBack(flat, expected, { sidebar: false }).issues).toEqual([]);
  });

  it("calls a PDF without text a scan", () => {
    const result = readBack("  \n ", expected, { sidebar: false });
    expect(result).toMatchObject({ score: 0, recovered: 0 });
    expect(result.issues[0].message).toMatch(/no text a parser can read/);
  });

  it("notices words missing from the text and a phone number split up", () => {
    const thin = clean
      .split("\n")
      .map((line, index) => (index % 3 === 0 ? line : line.split(" ").slice(0, 2).join(" ")))
      .join("\n");
    const result = readBack(`${thin}\n${profile.basics.email}`, { ...expected, phone: "+31 6 1234 5678" }, { sidebar: false });
    const messages = result.issues.map((issue) => issue.message).join("\n");
    expect(messages).toMatch(/phone number/);
    expect(messages).toMatch(/of your resume's words don't come out/);
  });
});
