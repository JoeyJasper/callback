import { describe, expect, it } from "vitest";

import { demoProfile, demoResumeUnits } from "@/lib/demo-profile";
import { documentLabels, ENGLISH_LABELS } from "@/lib/document-labels";
import { resumeContent } from "@/lib/resume-content";

import { expectedFrom, printedHeadings } from "./ats";
import { formatForCountry, missingPersonal, NO_FORMAT, RESUME_FORMATS, resolveFormat, resumePhoto } from "./resume-formats";

const today = new Date("2026-10-28T12:00:00Z");
const profile = demoProfile();
const withDetails = {
  ...profile,
  basics: { ...profile.basics, showAge: true, dob: "1992-04-18", nationality: "Indian", visaStatus: "UAE employment visa", noticePeriod: "30 days", placeOfBirth: "Chennai", maritalStatus: "" },
};

describe("resume formats by country", () => {
  it("picks the format of the job's country, and none for countries without one", () => {
    expect(formatForCountry("ae")?.id).toBe("GULF");
    expect(formatForCountry("SA")?.id).toBe("GULF");
    expect(formatForCountry("in")?.id).toBe("IN");
    expect(formatForCountry("de")?.id).toBe("DE");
    expect(formatForCountry("ch")?.id).toBe("DE");
    expect(formatForCountry("gb")?.id).toBe("UK");
    expect(formatForCountry("ie")?.id).toBe("UK");
    expect(formatForCountry("fr")?.id).toBe("EU");
    expect(formatForCountry("us")?.id).toBe("US");
    expect(formatForCountry("nz")?.id).toBe("AU");
    expect(formatForCountry("jp")).toBeNull();
    expect(formatForCountry(null)).toBeNull();
  });

  it("puts every country in one format at most", () => {
    const all = Object.values(RESUME_FORMATS).flatMap((format) => format.countries);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((code) => /^[a-z]{2}$/.test(code))).toBe(true);
  });

  it("follows the job's country unless one is picked, or none", () => {
    expect(resolveFormat(null, "ae")?.id).toBe("GULF");
    expect(resolveFormat("US", "ae")?.id).toBe("US");
    expect(resolveFormat(NO_FORMAT, "ae")).toBeNull();
    expect(resolveFormat("NOT-A-FORMAT", "in")?.id).toBe("IN");
  });

  it("decides the photo from the application's switch first, then the format", () => {
    expect(resumePhoto(null, RESUME_FORMATS.GULF)).toBe(true);
    expect(resumePhoto(null, RESUME_FORMATS.US)).toBe(false);
    expect(resumePhoto(false, RESUME_FORMATS.GULF)).toBe(false);
    expect(resumePhoto(true, RESUME_FORMATS.US)).toBe(true);
    expect(resumePhoto(null, null)).toBeNull();
  });

  it("says which personal details a format wants that the profile lacks", () => {
    expect(missingPersonal(RESUME_FORMATS.GULF, withDetails.basics)).toEqual(["Driving licence", "Marital status"]);
    expect(missingPersonal(RESUME_FORMATS.US, withDetails.basics)).toEqual([]);
  });
});

describe("a resume in a country's format", () => {
  const units = demoResumeUnits();

  it("shows a Gulf CV's personal details at the top, day first, and the format's summary heading", () => {
    const content = resumeContent(withDetails, { units, today, format: RESUME_FORMATS.GULF }, ENGLISH_LABELS);
    expect(content.personal).toEqual([
      { label: "Nationality", value: "Indian" },
      { label: "Visa status", value: "UAE employment visa" },
      { label: "Notice period", value: "30 days" },
      { label: "Date of birth", value: "18 April 1992" },
    ]);
    expect(content.personalAt).toBe("top");
    expect(content.summaryHeading).toBe("Professional summary");
    // The date of birth is in the personal details; "Age 34" stays out of the contacts.
    expect(content.contacts.some((item) => /Age/.test(item))).toBe(false);
    expect(content.declaration).toBeNull();
  });

  it("closes an Indian resume with the declaration, signed with place, date and name", () => {
    const content = resumeContent(withDetails, { units, today, format: RESUME_FORMATS.IN }, ENGLISH_LABELS);
    expect(content.personalAt).toBe("bottom");
    expect(content.summaryHeading).toBe("Career objective");
    expect(content.declaration).toEqual({
      text: "I hereby declare that the above information is true and correct to the best of my knowledge.",
      place: profile.basics.city,
      date: "28 October 2026",
      name: profile.basics.name,
    });
  });

  it("signs a Lebenslauf with place and date, in German when it's written in German", () => {
    const english = resumeContent(withDetails, { units, today, format: RESUME_FORMATS.DE }, ENGLISH_LABELS);
    expect(english.signature).toEqual({ line: `${profile.basics.city}, 28 October 2026`, name: profile.basics.name });
    const german = resumeContent(withDetails, { units, today, format: RESUME_FORMATS.DE }, documentLabels("German"));
    expect(german.personal).toEqual([
      { label: "Geburtsdatum", value: "18. April 1992" },
      { label: "Geburtsort", value: "Chennai" },
      { label: "Staatsangehörigkeit", value: "Indian" },
    ]);
    expect(german.signature?.line).toBe(`${profile.basics.city}, 28. Oktober 2026`);
    // Format headings are English: a German resume keeps its own.
    expect(german.summaryHeading).toBeNull();
  });

  it("keeps an American resume free of personal details and age, whatever the profile says", () => {
    const content = resumeContent(withDetails, { units, today, format: RESUME_FORMATS.US }, ENGLISH_LABELS);
    expect(content.personal).toEqual([]);
    expect(content.contacts.some((item) => /Age/.test(item))).toBe(false);
    expect(content.summaryHeading).toBe("Summary");
  });

  it("changes nothing without a format", () => {
    const content = resumeContent(withDetails, { units, today }, ENGLISH_LABELS);
    expect(content).toMatchObject({ personal: [], summaryHeading: null, declaration: null, signature: null });
    expect(content.contacts).toContain("Age 34");
  });

  it("tells the ATS check the headings it prints, closing ones last", () => {
    const india = resumeContent(withDetails, { units, today, format: RESUME_FORMATS.IN }, ENGLISH_LABELS);
    expect(printedHeadings(india, ENGLISH_LABELS, { split: false, sidebarEnd: false })).toEqual([
      "Career objective", "Experience", "Projects", "Education", "Publications", "Skills", "Languages", "Personal details", "Declaration",
    ]);
    const gulf = resumeContent(withDetails, { units, today, format: RESUME_FORMATS.GULF }, ENGLISH_LABELS);
    expect(printedHeadings(gulf, ENGLISH_LABELS, { split: true, sidebarEnd: false }).slice(0, 5)).toEqual(["Contact", "Skills", "Languages", "Personal details", "Professional summary"]);
    expect(expectedFrom(gulf, [], withDetails.basics).name).toBe(profile.basics.name);
  });
});
