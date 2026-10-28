import { z } from "zod";

import { interviewPrepSchema, type Extracted, type InterviewPrep, type Match } from "@/lib/application-data";
import type { ProfileData } from "@/lib/profile";

import { guardSources, unverifiedFacts } from "../fact-guard";

import {
  applicationFacts,
  candidateFacts,
  jobForPrompt,
  languageRule,
  NO_EM_DASHES,
  postingForPrompt,
  profileForPrompt,
  system,
  truthfulness,
  UNTRUSTED_POSTING,
  type Task,
} from "./prompt-parts";

export const INTERVIEW_PREP_VERSION = "interview-prep@1";

const answerSchema = z.object({
  pitch: z.string(),
  questions: z.array(
    z.object({
      question: z.string(),
      why: z.string(),
      situation: z.string(),
      task: z.string(),
      action: z.string(),
      result: z.string(),
      /** The id of the role or project the story is from. */
      from: z.string().nullable(),
    }),
  ),
  gaps: z.array(z.object({ requirement: z.string(), approach: z.string() })),
  askThem: z.array(z.string()),
});

const INSTRUCTIONS = `You prepare a candidate for a job interview, as JSON, from their profile and the job.

- pitch: their answer to "Tell me about yourself", about a minute spoken (120–170 words), in the first person: who they are as this job would see them, the two or three things from their experience that matter most for it, and why this role.
- questions: the 6–8 questions this interviewer is most likely to ask for this job, most likely first. Mix questions about the job's key requirements with behavioural ones ("Tell me about a time…") and one about why this company. For each:
  - why: one sentence on what the interviewer is checking.
  - situation, task, action, result: a STAR answer told from ONE real role or project in the profile, in the first person and as the candidate would say it. Action is the longest part and says what the candidate did. Result says what came of it, only with outcomes the profile states; when it states none, say what the work made possible without a number.
  - from: the id of the role or project the story is from.
- gaps: for each requirement the profile doesn't cover ("gap" or "partial"), one or two sentences on how to talk about it honestly in the interview: what is close in their experience, and how they'd close the gap. Never claim it.
- askThem: 3–5 questions for the candidate to ask, specific to this job and company (the team, the work, how success is measured), never about salary or holidays.`;

export type InterviewPrepInput = {
  profile: ProfileData;
  extracted: Extracted;
  match: Match | null;
  /** What the candidate tells the AI for this application (APP-15). */
  facts: string[];
  /** The posting as pasted. */
  posting: string;
};

const MAX_QUESTIONS = 8;
const MAX_ASK = 5;

/**
 * The interview prep pack: a pitch, likely questions with STAR answers from
 * the candidate's own roles and projects, how to talk about each gap, and
 * questions to ask. In strict mode, what the profile and posting don't back
 * is noted, as on documents.
 */
export const interviewPrep: Task<InterviewPrepInput, InterviewPrep> = async (provider, { profile, extracted, match, facts, posting }, options) => {
  const answer = await provider.complete({
    system: system(
      INSTRUCTIONS,
      truthfulness(options.strict),
      candidateFacts(profile, facts),
      languageRule(options.language),
      UNTRUSTED_POSTING,
      NO_EM_DASHES,
    ),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile:\n${profileForPrompt(profile)}`,
          `The job:\n${jobForPrompt(extracted, match)}`,
          `The posting:\n${postingForPrompt(posting)}`,
          applicationFacts(facts),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "interview_prep",
    creativity: options.creativity,
    signal: options.signal,
  });

  // Where each story is from, by the profile's own names: an id that isn't there leaves it unnamed.
  const sources = new Map<string, string>([
    ...profile.experience.map((entry): [string, string] => [entry.id, [entry.role, entry.company].filter(Boolean).join(" at ")]),
    ...profile.projects.map((entry): [string, string] => [entry.id, entry.name]),
  ]);
  const guard = options.strict ? guardSources(profile, extracted, posting, facts) : null;
  const check = (text: string) => {
    const unverified = guard ? unverifiedFacts(text, guard) : [];
    return unverified.length > 0 ? { unverified } : {};
  };
  const clean = (text: string) => text.trim();
  const pitch = clean(answer.pitch);

  const data = interviewPrepSchema.parse({
    pitch,
    ...(guard && unverifiedFacts(pitch, guard).length > 0 ? { pitchUnverified: unverifiedFacts(pitch, guard) } : {}),
    questions: answer.questions
      .filter((entry) => entry.question.trim())
      .slice(0, MAX_QUESTIONS)
      .map((entry) => {
        const star = { situation: clean(entry.situation), task: clean(entry.task), action: clean(entry.action), result: clean(entry.result) };
        return {
          question: clean(entry.question),
          why: clean(entry.why),
          answer: star,
          from: (entry.from && sources.get(entry.from)) || "",
          ...check(Object.values(star).join("\n")),
        };
      }),
    gaps: answer.gaps
      .filter((entry) => entry.requirement.trim() && entry.approach.trim())
      .map((entry) => ({ requirement: clean(entry.requirement), approach: clean(entry.approach), ...check(entry.approach) })),
    askThem: answer.askThem.map(clean).filter(Boolean).slice(0, MAX_ASK),
  });
  return { data, promptVersion: INTERVIEW_PREP_VERSION };
};
