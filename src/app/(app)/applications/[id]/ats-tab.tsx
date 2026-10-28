"use client";

import { useId, useState, useTransition } from "react";

import { ScoreBadge } from "@/components/score-badge";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import type { Match, Requirement, Unit } from "@/lib/application-data";
import { keywordCoverage, resumeText, type Coverage, type ParseResult, type TermCheck } from "@/lib/ats";
import { cn } from "@/lib/cn";
import { documentLabels } from "@/lib/document-labels";
import type { ProfileData } from "@/lib/profile";
import { resumeContent } from "@/lib/resume-content";

import { testReadResume } from "./ats-actions";

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

/** What to ask the AI so the resume uses the posting's words where the profile already shows them. */
export function addTermsRequest(items: TermCheck[]): string {
  const list = items.map((item) => `“${item.terms[0]}” (for: ${item.requirement})`).join("; ");
  return `Use the posting's exact words for these where my profile already shows them: ${list}. Put each where my experience backs it, and don't add anything my profile doesn't show.`;
}

const STATUS: Record<TermCheck["status"], { mark: string; label: string; className: string }> = {
  found: { mark: "✓", label: "In your resume", className: "border-primary bg-primary text-on-primary" },
  addable: { mark: "+", label: "Your profile shows it, but the resume doesn't use the posting's word", className: "border-warning-line bg-warning-surface text-warning" },
  gap: { mark: "–", label: "Not in your profile, so it stays out", className: "border-line-strong text-muted" },
};

/**
 * The ATS check tab: what an applicant tracking system finds in the tailored
 * resume. Keyword coverage updates as the resume changes; the PDF read-back
 * renders the PDF and reads it like a parser, on request.
 */
export function AtsTab({
  applicationId,
  coverage,
  aiReady,
  unitsKey,
  onAskToAdd,
}: {
  applicationId: string;
  coverage: Coverage;
  aiReady: boolean;
  /** Changes whenever the resume does, so an older read-back is marked as such. */
  unitsKey: string;
  onAskToAdd: (request: string) => void;
}) {
  const keywordsId = useId();
  const parseId = useId();
  const [reading, startReading] = useTransition();
  const [readBack, setReadBack] = useState<{ result: ParseResult; key: string } | null>(null);
  const required = coverage.items.filter((item) => item.mustHave);
  const plus = coverage.items.filter((item) => !item.mustHave);
  const addable = coverage.items.filter((item) => item.status === "addable");
  const stale = readBack !== null && readBack.key !== unitsKey;

  const testRead = () =>
    startReading(async () => {
      const result = await testReadResume({ id: applicationId });
      if (!result.ok) return toast(result.error);
      setReadBack({ result: result.data, key: unitsKey });
    });

  const rows = (items: TermCheck[]) => (
    <ul className="flex flex-col">
      {items.map((item, index) => {
        const { mark, label, className } = STATUS[item.status];
        return (
          <li key={index} className="flex items-start gap-3.5 border-t border-line py-3">
            <span aria-hidden className={cn("grid size-[22px] flex-none place-items-center rounded-full border text-xs font-semibold", className)}>
              {mark}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-field">
                <span className="sr-only">{label}: </span>
                {item.found ? `“${item.found}”` : item.terms.map((term) => `“${term}”`).join(" or ")}
              </p>
              <p className="text-meta text-muted">
                {item.status === "found" ? item.requirement : item.status === "addable" ? `${item.requirement}. Your profile shows it; the resume doesn't use the posting's word yet.` : `${item.requirement}. Not in your profile, so it stays out.`}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="@container flex flex-1 flex-col items-center gap-4 overflow-auto bg-canvas px-10 pt-11 pb-16">
      <section aria-labelledby={keywordsId} className="flex w-full max-w-[640px] flex-col gap-4 rounded-panel border border-line-card bg-card px-[30px] py-7">
        <div className="flex items-start gap-4">
          {coverage.score !== null && <ScoreBadge score={coverage.score} />}
          <div className="flex flex-col gap-1">
            <h2 id={keywordsId} className="text-[15px] font-medium">
              The posting&apos;s keywords
            </h2>
            <p className="text-sm text-pretty text-muted">
              {coverage.score === null
                ? "The posting names no skills or terms to look for. Tracking systems will rank this resume on its text as a whole."
                : `${coverage.required.found} of ${coverage.required.total} required terms are in your resume. Tracking systems search for the posting's exact words, so a skill described in other words can be missed.`}
            </p>
          </div>
        </div>
        {addable.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-warning-surface px-4 py-3">
            <p className="text-sm text-warning">
              {addable.length === 1 ? "1 term your profile backs is missing." : `${addable.length} terms your profile backs are missing.`}
            </p>
            {aiReady && (
              <Button variant="secondary" size="sm" onClick={() => onAskToAdd(addTermsRequest(addable))}>
                Ask AI to work {addable.length === 1 ? "it" : "them"} in
              </Button>
            )}
          </div>
        )}
        {required.length > 0 && (
          <div className="flex flex-col">
            <h3 className="pb-2 text-meta font-medium text-muted">Required</h3>
            {rows(required)}
          </div>
        )}
        {plus.length > 0 && (
          <div className="flex flex-col">
            <h3 className="pb-2 text-meta font-medium text-muted">Nice to have</h3>
            {rows(plus)}
          </div>
        )}
      </section>

      <section aria-labelledby={parseId} className="flex w-full max-w-[640px] flex-col gap-4 rounded-panel border border-line-card bg-card px-[30px] py-7">
        <div className="flex items-start gap-4">
          {readBack && !stale && <ScoreBadge score={readBack.result.score} />}
          <div className="flex flex-1 flex-col gap-1">
            <h2 id={parseId} className="text-[15px] font-medium">
              How a tracking system reads your PDF
            </h2>
            <p className="text-sm text-pretty text-muted">
              Renders the PDF exactly as you&apos;d download it and reads its text back the way a parser does, to catch layouts that scramble it.
            </p>
          </div>
        </div>
        <div>
          <Button variant={readBack ? "secondary" : "primary"} size="sm" aria-disabled={reading || undefined} onClick={() => !reading && testRead()}>
            {reading ? "Reading the PDF…" : readBack ? "Test-read it again" : "Test-read the PDF"}
          </Button>
        </div>
        {readBack && (
          <div aria-live="polite" className="flex flex-col gap-3">
            {stale && <p className="text-meta text-warning">The resume changed since this check. Test-read it again.</p>}
            <p className="text-sm">
              {readBack.result.intact.total > 0 && `${readBack.result.intact.count} of ${readBack.result.intact.total} lines come out in one piece. `}
              {`${Math.round(readBack.result.recovered * 100)}% of your words come out as text.`}
            </p>
            {readBack.result.issues.length === 0 ? (
              <p className="text-sm text-ink">✓ A parser reads this PDF cleanly: name, contact details, headings and every line come out in order.</p>
            ) : (
              <ul aria-label="Problems found" className="flex flex-col">
                {readBack.result.issues.map((issue, index) => (
                  <li key={index} className="flex flex-col gap-0.5 border-t border-line py-3">
                    <p className={cn("text-field", issue.severity === "error" && "text-error-strong")}>
                      <span className="sr-only">{issue.severity === "error" ? "Problem: " : "Warning: "}</span>
                      {issue.message}
                    </p>
                    <p className="text-meta text-muted">{issue.fix}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
