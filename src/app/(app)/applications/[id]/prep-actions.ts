"use server";

import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { isAiConfigured } from "@/lib/ai/config";
import { interviewPrepJob, prepJobKey } from "@/lib/jobs/interview-prep";
import { findUnfinishedJobs, startJob } from "@/lib/jobs/runner";
import { prisma } from "@/lib/prisma";

/**
 * "Prepare for the interview" on the Interview prep tab: writes the pack, or
 * writes it again. One already being written is followed rather than started twice.
 */
export const startInterviewPrep = action(z.object({ id: z.string().min(1) }), async ({ id }) => {
  if (!(await prisma.application.count({ where: { id } }))) throw new ActionError("That application no longer exists.");
  if (!(await isAiConfigured())) throw new ActionError("That needs an AI provider. Choose one in Settings → AI provider.");
  const [running] = await findUnfinishedJobs(prepJobKey(id));
  return running?.id ?? startJob(interviewPrepJob, { applicationId: id }, { key: prepJobKey(id), applicationId: id });
});
