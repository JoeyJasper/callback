import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { interviewPrep } from "@/lib/ai/tasks";
import { extractedOf, matchSchema } from "@/lib/application-data";
import { prisma } from "@/lib/prisma";
import { loadFactTexts, loadProfile } from "@/lib/profile-data";

import { defineJob } from "./runner";

/** The key of an application's interview prep, to find it again after a reload. */
export const prepJobKey = (applicationId: string) => `interview-prep:${applicationId}`;

/**
 * Writes the application's interview prep pack (its Interview prep tab), or
 * writes it again, and saves it with the application. In the language the
 * documents were written in, since that's usually the interview's.
 */
export const interviewPrepJob = defineJob({
  type: "interview-prep",
  input: z.object({ applicationId: z.string().min(1) }),
  result: z.object({ written: z.literal(true) }),
  async run({ applicationId }, { step, signal }) {
    await step("Preparing your interview pack");
    const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    const match = matchSchema.safeParse(application.match);
    const [provider, options, profile, facts] = await Promise.all([getAiProvider(), loadTaskOptions(), loadProfile(), loadFactTexts(applicationId)]);
    const { data, promptVersion } = await interviewPrep(
      provider,
      { profile, extracted: extractedOf(application), match: match.success ? match.data : null, facts, posting: application.postingText },
      { ...options, language: application.language || options.language, signal },
    );
    await prisma.application.update({ where: { id: applicationId }, data: { interviewPrep: data, interviewPrepWith: promptVersion } });
    return { written: true as const };
  },
});
