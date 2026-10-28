import "server-only";

import { ApplicationOrigin, ApplicationStatus, DocumentKind, EmailDirection, FunnelStage } from "@/generated/prisma/enums";
import { extractedSchema, matchSchema, matchScore, unitsSchema } from "@/lib/application-data";
import { resumeCoverage } from "@/lib/ats";
import { settled, type OutcomeRow, type OutcomeSource } from "@/lib/outcomes";
import { prisma } from "@/lib/prisma";
import { loadProfile } from "@/lib/profile-data";
import { resolveFormat } from "@/lib/resume-formats";

const PROGRESSED: FunnelStage[] = [FunnelStage.SCREENING, FunnelStage.INTERVIEW, FunnelStage.OFFER, FunnelStage.ACCEPTED];
const INTERVIEWED: FunnelStage[] = [FunnelStage.INTERVIEW, FunnelStage.OFFER, FunnelStage.ACCEPTED];

/**
 * Every application that went out, as an outcome row, settled ones only by
 * default: answered, or sent long enough ago that silence counts.
 */
export async function loadOutcomeRows({ now = new Date(), all = false }: { now?: Date; all?: boolean } = {}): Promise<OutcomeRow[]> {
  const [applications, profile] = await Promise.all([
    prisma.application.findMany({
      where: { sentAt: { not: null }, awaitingReview: false },
      select: {
        id: true,
        role: true,
        title: true,
        company: true,
        tone: true,
        language: true,
        status: true,
        furthestStage: true,
        sentAt: true,
        agentScore: true,
        origin: true,
        resumeFormat: true,
        extracted: true,
        match: true,
        posting: { select: { source: true, externalId: true } },
        startup: { select: { id: true } },
        events: { where: { to: ApplicationStatus.REJECTED }, select: { id: true }, take: 1 },
        emails: { where: { direction: EmailDirection.INCOMING }, select: { id: true }, take: 1 },
        documents: { where: { kind: DocumentKind.RESUME }, select: { units: true }, take: 1 },
      },
    }),
    loadProfile(),
  ]);
  // Fit scores given in Find jobs, for applications started there.
  const postings = applications.flatMap((application) => (application.posting ? [application.posting] : []));
  const scores = postings.length
    ? await prisma.postingScore.findMany({ where: { OR: postings.map(({ source, externalId }) => ({ source, externalId })) }, select: { source: true, externalId: true, score: true } })
    : [];
  const scoreOf = new Map(scores.map((score) => [`${score.source}:${score.externalId}`, score.score]));

  const rows = applications.map((application): OutcomeRow => {
    const source: OutcomeSource = application.origin === ApplicationOrigin.AGENT ? "agent" : application.posting ? "find-jobs" : application.startup ? "startups" : "pasted";
    const match = matchSchema.safeParse(application.match);
    const extracted = extractedSchema.safeParse(application.extracted);
    const units = unitsSchema.safeParse(application.documents[0]?.units);
    const hits = match.success && match.data.items.length > 0 ? matchScore(match.data) : null;
    const keywords =
      units.success && extracted.success
        ? resumeCoverage({
            profile,
            units: units.data,
            language: application.language,
            includeReferences: false,
            showPhoto: null,
            requirements: extracted.data.requirements,
            match: match.success ? match.data : null,
          }).score
        : null;
    const stage = application.furthestStage;
    return {
      id: application.id,
      role: application.role || application.title,
      company: application.company,
      source,
      tone: application.tone,
      fit: application.agentScore ?? (application.posting ? (scoreOf.get(`${application.posting.source}:${application.posting.externalId}`) ?? null) : null),
      covered: hits ? Math.round((hits.hit / hits.total) * 100) : null,
      keywords,
      // The format the resume went out in: the one picked, or the job country's.
      format: resolveFormat(application.resumeFormat, extracted.success ? extracted.data.country : null)?.name ?? null,
      sentAt: application.sentAt!,
      progressed: stage !== null && PROGRESSED.includes(stage),
      interviewed: stage !== null && INTERVIEWED.includes(stage),
      rejected: application.status === ApplicationStatus.REJECTED || application.events.length > 0,
      replied: application.emails.length > 0,
    };
  });
  return all ? rows : rows.filter((row) => settled(row, now));
}
