import type { Unit } from "@/lib/application-data";
import { ageLabel, ENGLISH_LABELS, languagesLine, type DocumentLabels } from "@/lib/document-labels";
import { publicationHref, publicationLink } from "@/lib/citation";
import { ageOn, formatDateRange, resumePublications, type Basics, type ProfileData } from "@/lib/profile";
import { PERSONAL_LABELS, type PersonalField, type ResumeFormat } from "@/lib/resume-formats";

// What a resume shows, worked out from the profile (the base resume) or from
// a tailored document's units, so the renderer only has to lay it out.

export type ResumeContent = {
  name: string;
  headline: string;
  /** The profile photo's data URL, or null when the resume has none (#224). */
  photo: string | null;
  /** Email, phone, "City, Country", website, LinkedIn and "Age N", whichever are filled in. */
  contacts: string[];
  summary: string;
  experience: {
    id: string;
    role: string;
    company: string;
    dates: string;
    bullets: string[];
    /** The skills used in the role (RES-6). */
    skills: string[];
  }[];
  /** Projects (PRO-13), laid out like roles. */
  projects: {
    id: string;
    name: string;
    /** "github.com/jane/tidewater", without "https://". */
    link: string;
    dates: string;
    bullets: string[];
    skills: string[];
  }[];
  education: { id: string; degree: string; school: string; dates: string; notes: string }[];
  /** Publications (#218), word for word, in the profile's order. */
  publications: {
    id: string;
    /** As written, with **bold** and *italic*. */
    citation: string;
    /** "doi.org/10.1038/…", without "https://". */
    link: string;
    /** What the link opens, or null when it isn't a web address. */
    href: string | null;
  }[];
  /** "Figma · User research · …" */
  skills: string;
  /** "Dutch: Native · English: Fluent (C2)" */
  languages: string;
  references: { id: string; name: string; role: string; contact: string }[];
  /** Personal details the resume's format shows (resume formats), in its order; empty without a format. */
  personal: { label: string; value: string }[];
  /** Where they go: under the header, or before the end. */
  personalAt: "top" | "bottom";
  /** The summary's heading when the format names it, e.g. "Professional summary". */
  summaryHeading: string | null;
  /** India's closing declaration, with place, date and name. */
  declaration: { text: string; place: string; date: string; name: string } | null;
  /** Place, date and name at the end (German-speaking countries). */
  signature: { line: string; name: string } | null;
};

export type ResumeOptions = {
  /** A tailored document's units; they replace the profile's text (APP-4). */
  units?: Unit[];
  /** Settings → "Include references" (SET-9). */
  includeReferences?: boolean;
  /** An application's Photo switch (#224); null or left out follows the profile's "Show on resumes". */
  showPhoto?: boolean | null;
  /** For "Age N"; defaults to now. */
  today?: Date;
  /** The resume's format by country (resume formats); null or left out is the theme as it is. */
  format?: ResumeFormat | null;
};

/** Personal details' labels in the languages their formats are written in; English otherwise. */
const PERSONAL_WORDS: Record<string, Partial<Record<PersonalField | "dob" | "heading" | "declaration" | "place" | "date", string>>> = {
  de: { heading: "Persönliche Daten", dob: "Geburtsdatum", placeOfBirth: "Geburtsort", nationality: "Staatsangehörigkeit", maritalStatus: "Familienstand", drivingLicence: "Führerschein", noticePeriod: "Kündigungsfrist", visaStatus: "Aufenthaltsstatus" },
};

/** "Personal details" and the other words around them, in the document's language where known. */
export function personalWords(labels: Pick<DocumentLabels, "locale">) {
  const words = PERSONAL_WORDS[labels.locale.slice(0, 2)] ?? {};
  return {
    heading: words.heading ?? "Personal details",
    declaration: words.declaration ?? "Declaration",
    place: words.place ?? "Place",
    date: words.date ?? "Date",
    label: (field: PersonalField | "dob") => words[field] ?? PERSONAL_LABELS[field],
  };
}

const longDate = (date: Date, locale: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);

/** The separator between contact details on one line. */
export const CONTACT_SEPARATOR = "  ·  ";

/** Contact details in the order the resume header lists them. */
export function contactItems(basics: Basics, today = new Date(), labels = ENGLISH_LABELS): string[] {
  const age = basics.showAge ? ageOn(basics.dob, today) : null;
  return [
    basics.email,
    basics.phone,
    [basics.city, basics.country].map((part) => part.trim()).filter(Boolean).join(", "),
    basics.website,
    basics.linkedin,
    age === null ? "" : ageLabel(age, labels),
  ]
    .map((item) => item.trim())
    .filter(Boolean);
}

/** A link as a resume shows it: "https://www.example.com/x/" is "example.com/x". */
export const displayLink = (link: string) =>
  link
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** What the resume shows, with its dates and levels in the words of `labels`. */
export function resumeContent(
  profile: ProfileData,
  { units, includeReferences = false, showPhoto, today = new Date(), format = null }: ResumeOptions = {},
  labels: DocumentLabels = ENGLISH_LABELS,
): ResumeContent {
  // A format that leaves out age leaves it out whatever the profile says.
  const basics = format && !format.allowAge ? { ...profile.basics, showAge: false } : profile.basics;
  const words = personalWords(labels);
  const place = basics.city.trim();
  // Day before month everywhere but North America: "18 April 1992".
  const dateLocale = labels.locale.startsWith("en") && format && format.id !== "US" && format.id !== "CA" ? "en-GB" : labels.locale;
  const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(basics.dob) ? longDate(new Date(`${basics.dob}T00:00:00Z`), dateLocale) : "";
  const skillNames = new Map(profile.skills.map((skill) => [skill.id, skill.name]));
  const dates = { locale: labels.locale, present: labels.present };

  const experience = (entry: ProfileData["experience"][number], bullets: string) => ({
    id: entry.id,
    role: entry.role.trim(),
    company: entry.company.trim(),
    dates: formatDateRange(entry, dates),
    bullets: lines(bullets),
    skills: entry.skillIds.flatMap((id) => skillNames.get(id) ?? []),
  });
  const project = (entry: ProfileData["projects"][number], bullets: string) => ({
    id: entry.id,
    name: entry.name.trim(),
    link: displayLink(entry.link),
    dates: formatDateRange(entry, dates),
    bullets: lines(bullets),
    skills: entry.skillIds.flatMap((id) => skillNames.get(id) ?? []),
  });
  const publication = (entry: ProfileData["publications"][number], citation: string) => ({
    id: entry.id,
    citation: citation.trim(),
    link: displayLink(publicationLink(entry.link)),
    href: publicationHref(entry.link),
  });
  const education = (entry: ProfileData["education"][number], notes: string) => ({
    id: entry.id,
    degree: entry.degree.trim(),
    school: entry.school.trim(),
    dates: formatDateRange(entry, dates),
    notes: notes.trim(),
  });

  const content: ResumeContent = {
    name: basics.name.trim() || "Your name",
    headline: basics.headline.trim(),
    photo: profile.photo && (showPhoto ?? profile.photo.onResumes) ? profile.photo.src : null,
    contacts: contactItems(basics, today, labels),
    summary: basics.summary.trim(),
    experience: profile.experience.map((entry) => experience(entry, entry.bullets)),
    projects: profile.projects.map((entry) => project(entry, entry.bullets)),
    education: profile.education.map((entry) => education(entry, entry.notes)),
    publications: resumePublications(profile.publications).map((entry) => publication(entry, entry.citation)),
    skills: profile.skills.map((skill) => skill.name).join(" · "),
    languages: languagesLine(profile.languages, labels),
    references: includeReferences
      ? profile.references.map((reference) => ({
          id: reference.id,
          name: reference.name.trim(),
          role: [reference.relation, reference.company].map((part) => part.trim()).filter(Boolean).join(", "),
          contact: [reference.email, reference.phone].map((part) => part.trim()).filter(Boolean).join(" · "),
        }))
      : [],
    personal: (format?.personal ?? []).flatMap((field) => {
      const value = field === "dob" ? dateOfBirth : (basics[field] ?? "").trim();
      return value ? [{ label: words.label(field), value }] : [];
    }),
    personalAt: format?.personalAt ?? "bottom",
    // Format headings are English; a resume written in another language keeps its own word.
    summaryHeading: format?.summaryHeading && labels.locale.startsWith("en") ? format.summaryHeading : null,
    declaration: format?.declaration
      ? { text: format.declaration, place, date: longDate(today, dateLocale), name: basics.name.trim() }
      : null,
    signature: format?.signature ? { line: [place, longDate(today, dateLocale)].filter(Boolean).join(", "), name: basics.name.trim() } : null,
  };

  if (units) {
    // A tailored resume holds exactly what its units hold, in their order:
    // a role, project, degree or publication without a unit was left out on purpose.
    const text = (id: string) => units.find((unit) => unit.id === id)?.text ?? "";
    const withUnit = <T extends { id: string }>(prefix: string, entries: T[]) =>
      units.flatMap((unit) => {
        if (!unit.id.startsWith(prefix)) return [];
        const entry = entries.find(({ id }) => `${prefix}${id}` === unit.id);
        return entry ? [{ entry, text: unit.text }] : [];
      });

    content.summary = text("summary").trim();
    content.skills = text("skills").trim();
    content.languages = text("languages").trim();
    content.experience = withUnit("experience:", profile.experience).map(({ entry, text }) =>
      experience(entry, text),
    );
    content.projects = withUnit("project:", profile.projects).map(({ entry, text }) => project(entry, text));
    content.education = withUnit("education:", profile.education).map(({ entry, text }) =>
      education(entry, text),
    );
    content.publications = withUnit("publication:", profile.publications).flatMap(({ entry, text }) =>
      text.trim() ? [publication(entry, text)] : [],
    );
  }

  return content;
}
