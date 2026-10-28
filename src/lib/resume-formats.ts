import { PaperSize } from "@/generated/prisma/enums";
import type { PersonalField } from "@/lib/profile";

// Resume formats by country: what a resume for a job in a given country
// shows and leaves out, so a Gulf CV carries the photo, nationality and visa
// status recruiters there expect, and an American resume leaves out what
// employers there must not ask for. A tailored resume follows the format of
// the job's country unless the user picks another (Application.resumeFormat).
//
// Sources, checked October 2026: national career services and recruiters'
// guides for each market (see the pull request). Conventions vary by
// employer; the user can always pick another format or none.

export { PERSONAL_FIELDS, type PersonalField } from "@/lib/profile";

export const PERSONAL_LABELS: Record<PersonalField | "dob", string> = {
  dob: "Date of birth",
  nationality: "Nationality",
  visaStatus: "Visa status",
  noticePeriod: "Notice period",
  drivingLicence: "Driving licence",
  maritalStatus: "Marital status",
  placeOfBirth: "Place of birth",
};

export const RESUME_FORMAT_IDS = ["US", "CA", "UK", "EU", "DE", "GULF", "IN", "AU"] as const;
export type ResumeFormatId = (typeof RESUME_FORMAT_IDS)[number];

export type ResumeFormat = {
  id: ResumeFormatId;
  /** "Gulf CV", as the format menu names it. */
  name: string;
  /** Where it's used, for the menu: "UAE, Saudi Arabia, Qatar…". */
  where: string;
  /** ISO 3166-1 alpha-2 codes, lower case, of the countries it's the format for. */
  countries: readonly string[];
  paper: PaperSize;
  /** "hide": never, whatever the profile says; "show": when the profile has one, unless switched off for the application. */
  photo: "hide" | "show";
  /** Personal details shown in their own section, in this order; dob is the date of birth. */
  personal: readonly (PersonalField | "dob")[];
  /** Where the personal details go. */
  personalAt: "top" | "bottom";
  /** "Age 34" next to the contact details is left out when false, whatever the profile says. */
  allowAge: boolean;
  /** The summary's heading, when the format names it differently. */
  summaryHeading?: string;
  /** A closing declaration (India), signed with place, date and name. */
  declaration?: string;
  /** Place, date and name at the end (German-speaking countries). */
  signature?: boolean;
  /** How long it usually runs, for the writer and the user. */
  pages: string;
  /** For the resume writer: what this market expects of the text. */
  writing: string;
  /** For the user: what this format does, in a few short lines. */
  tips: readonly string[];
};

export const RESUME_FORMATS: Record<ResumeFormatId, ResumeFormat> = {
  US: {
    id: "US",
    name: "American resume",
    where: "United States",
    countries: ["us"],
    paper: PaperSize.LETTER,
    photo: "hide",
    personal: [],
    personalAt: "bottom",
    allowAge: false,
    summaryHeading: "Summary",
    pages: "one page, two at most for long careers",
    writing:
      "This is an American resume: concise and results-first. A two-sentence summary. Bullets start with a strong past-tense verb and lead with outcomes the profile states. Prefer one page: give older roles one or two bullets.",
    tips: ["No photo, age or date of birth: US employers avoid them", "US Letter paper", "One page, two for long careers"],
  },
  CA: {
    id: "CA",
    name: "Canadian resume",
    where: "Canada",
    countries: ["ca"],
    paper: PaperSize.LETTER,
    photo: "hide",
    personal: [],
    personalAt: "bottom",
    allowAge: false,
    summaryHeading: "Summary",
    pages: "two pages at most",
    writing: "This is a Canadian resume: concise and results-first, like an American one, up to two pages. Bullets start with a verb and lead with outcomes the profile states.",
    tips: ["No photo, age, date of birth or marital status", "US Letter paper", "Two pages at most"],
  },
  UK: {
    id: "UK",
    name: "UK & Ireland CV",
    where: "United Kingdom, Ireland",
    countries: ["gb", "ie"],
    paper: PaperSize.A4,
    photo: "hide",
    personal: [],
    personalAt: "bottom",
    allowAge: false,
    summaryHeading: "Personal statement",
    pages: "two pages",
    writing:
      "This is a British CV: a short personal statement of three or four lines in the first person without \"I\" at the start of every sentence, then achievements over duties. Up to two pages, British spelling.",
    tips: ["No photo, age or date of birth", "A personal statement on top", "A4, two pages at most"],
  },
  EU: {
    id: "EU",
    name: "European CV",
    where: "France, the Netherlands, Spain, Italy, the Nordics and the rest of the EU",
    countries: [
      "fr", "nl", "be", "lu", "es", "pt", "it", "mt", "gr", "cy", "se", "dk", "no", "fi", "is",
      "pl", "cz", "sk", "hu", "si", "hr", "ro", "bg", "ee", "lv", "lt",
    ],
    paper: PaperSize.A4,
    photo: "show",
    personal: ["nationality"],
    personalAt: "top",
    allowAge: true,
    pages: "two pages",
    writing: "This is a European CV: a short profile, then experience with what was achieved. Up to two pages.",
    tips: ["Photo if you have one (common in France, Belgium and the south; switch it off for the Netherlands and the Nordics)", "Nationality, which matters for work permits", "A4, two pages"],
  },
  DE: {
    id: "DE",
    name: "German Lebenslauf",
    where: "Germany, Austria, Switzerland",
    countries: ["de", "at", "ch", "li"],
    paper: PaperSize.A4,
    photo: "show",
    personal: ["dob", "placeOfBirth", "nationality"],
    personalAt: "top",
    allowAge: false,
    signature: true,
    pages: "one to two pages",
    writing:
      "This is a German Lebenslauf: factual and complete, without gaps left unexplained. A short profile at most; let the roles speak. Up to two pages.",
    tips: ["Photo top right, as is still usual", "Date and place of birth, nationality", "Signed with place and date at the end", "A4, one to two pages"],
  },
  GULF: {
    id: "GULF",
    name: "Gulf CV",
    where: "UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman",
    countries: ["ae", "sa", "qa", "kw", "bh", "om"],
    paper: PaperSize.A4,
    photo: "show",
    personal: ["nationality", "visaStatus", "noticePeriod", "dob", "drivingLicence", "maritalStatus"],
    personalAt: "top",
    allowAge: false,
    summaryHeading: "Professional summary",
    pages: "two pages, three for senior roles",
    writing:
      "This is a Gulf CV (UAE, Saudi Arabia, Qatar…): a three-line professional summary aimed at this role, then experience with the scale the profile states (team sizes, budgets, users, markets). Up to two pages.",
    tips: [
      "A professional photo, as recruiters there expect",
      "Nationality, visa status and notice period up front: they decide relocation and start dates",
      "Date of birth, driving licence and marital status if you add them",
      "A4, two pages",
    ],
  },
  IN: {
    id: "IN",
    name: "Indian resume",
    where: "India",
    countries: ["in"],
    paper: PaperSize.A4,
    photo: "show",
    personal: ["dob", "nationality", "maritalStatus", "noticePeriod"],
    personalAt: "bottom",
    allowAge: false,
    summaryHeading: "Career objective",
    declaration: "I hereby declare that the above information is true and correct to the best of my knowledge.",
    pages: "two pages",
    writing:
      "This is an Indian resume: open with a two or three line career objective aimed at this role (a short professional summary for experienced candidates), then experience. Up to two pages.",
    tips: [
      "A career objective on top",
      "Personal details (date of birth, nationality, notice period) near the end",
      "The usual declaration, with place, date and name",
      "Photo if you have one; switch it off for product companies and startups",
    ],
  },
  AU: {
    id: "AU",
    name: "Australian & NZ resume",
    where: "Australia, New Zealand",
    countries: ["au", "nz"],
    paper: PaperSize.A4,
    photo: "hide",
    personal: [],
    personalAt: "bottom",
    allowAge: false,
    summaryHeading: "Career summary",
    pages: "two to three pages",
    writing: "This is an Australian resume: a short career summary, then experience with achievements the profile states. Two to three pages are fine.",
    tips: ["No photo, age or date of birth", "A career summary on top", "A4, two to three pages"],
  },
};

/** The format of the country a job is in, or null for countries without one. */
export function formatForCountry(country: string | null | undefined): ResumeFormat | null {
  const code = country?.trim().toLowerCase();
  if (!code) return null;
  return Object.values(RESUME_FORMATS).find((format) => format.countries.includes(code)) ?? null;
}

/** Application.resumeFormat: a format's id, "NONE" for the theme as it is, or null to follow the job's country. */
export const NO_FORMAT = "NONE";

/** The format an application's resume uses: the one picked, or the job country's. */
export function resolveFormat(chosen: string | null | undefined, country: string | null | undefined): ResumeFormat | null {
  if (chosen === NO_FORMAT) return null;
  if (chosen && chosen in RESUME_FORMATS) return RESUME_FORMATS[chosen as ResumeFormatId];
  return formatForCountry(country);
}

/** Personal details the format asks for that the profile doesn't have yet. */
export function missingPersonal(format: ResumeFormat, values: Partial<Record<PersonalField | "dob", string>>): string[] {
  return format.personal.filter((field) => !values[field]?.trim()).map((field) => PERSONAL_LABELS[field]);
}

/**
 * Whether a tailored resume shows the photo: the application's own switch
 * when it's been used, else what the format expects, else the profile's choice (null).
 */
export function resumePhoto(showPhoto: boolean | null, format: ResumeFormat | null): boolean | null {
  return showPhoto ?? (format ? format.photo === "show" : null);
}
