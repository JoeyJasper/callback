"use server";

import { z } from "zod";

import { DocumentKind } from "@/generated/prisma/enums";
import { action, ActionError } from "@/lib/action";
import { checkResumePdf } from "@/lib/ats-check";
import { prisma } from "@/lib/prisma";

/**
 * The ATS tab's "Test-read the PDF": renders the tailored resume as Download
 * PDF would and reads its text back the way an applicant tracking system does.
 */
export const testReadResume = action(z.object({ id: z.string().min(1) }), async ({ id }) => {
  const resume = await prisma.document.count({ where: { applicationId: id, kind: DocumentKind.RESUME } });
  if (!(await prisma.application.count({ where: { id } }))) throw new ActionError("That application no longer exists.");
  if (resume === 0) throw new ActionError("This application has no tailored resume to check.");
  const result = await checkResumePdf(id);
  if (!result) throw new ActionError("This application has no tailored resume to check.");
  return result;
});
