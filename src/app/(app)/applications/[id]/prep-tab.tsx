"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useJob } from "@/hooks/use-job";
import type { InterviewPrep } from "@/lib/application-data";
import { copyText } from "@/lib/copy-text";

import { startInterviewPrep } from "./prep-actions";

/** The pack as plain text, for copying into notes. */
export function prepText(prep: InterviewPrep): string {
  return [
    "Tell me about yourself",
    prep.pitch,
    "",
    "Likely questions",
    ...prep.questions.flatMap((entry, index) => [
      `${index + 1}. ${entry.question}`,
      `   Why they ask: ${entry.why}`,
      ...(entry.from ? [`   From: ${entry.from}`] : []),
      `   Situation: ${entry.answer.situation}`,
      `   Task: ${entry.answer.task}`,
      `   Action: ${entry.answer.action}`,
      `   Result: ${entry.answer.result}`,
      "",
    ]),
    ...(prep.gaps.length > 0 ? ["Gaps, and how to talk about them", ...prep.gaps.map((gap) => `- ${gap.requirement}: ${gap.approach}`), ""] : []),
    "Questions to ask them",
    ...prep.askThem.map((question) => `- ${question}`),
  ].join("\n");
}

/**
 * The Interview prep tab: a pitch, the questions this interviewer is likely
 * to ask with STAR answers from the user's own roles, how to talk about each
 * gap honestly, and questions to ask them.
 */
export function PrepTab({
  applicationId,
  prep,
  preparing,
  aiReady,
  interviewing,
}: {
  applicationId: string;
  prep: InterviewPrep | null;
  /** The job writing it, while one is queued or running, e.g. since before a reload. */
  preparing: string | null;
  aiReady: boolean;
  /** The application is at Interview: the pack is for now, not later. */
  interviewing: boolean;
}) {
  const router = useRouter();
  const headingId = useId();
  const [jobId, setJobId] = useState(preparing);
  const [revision, setRevision] = useState(0);
  const [starting, startStarting] = useTransition();
  const job = useJob(jobId, revision, (view) => {
    if (view.status === "DONE") {
      setJobId(null);
      router.refresh();
    } else if (view.status === "FAILED") {
      setJobId(null);
      toast(view.error ?? "That didn't work. Try again.");
    }
  });
  const busy = starting || jobId !== null;

  const prepare = () =>
    startStarting(async () => {
      const result = await startInterviewPrep({ id: applicationId });
      if (!result.ok) return toast(result.error);
      setJobId(result.data);
      setRevision((count) => count + 1);
    });

  const copy = async () => {
    if (prep && (await copyText(prepText(prep)))) toast("Copied the interview prep.");
  };

  return (
    <div className="@container flex flex-1 flex-col items-center gap-4 overflow-auto bg-canvas px-10 pt-11 pb-16">
      <section aria-labelledby={headingId} className="flex w-full max-w-[680px] flex-col gap-3 rounded-panel border border-line-card bg-card px-[30px] py-7">
        <h2 id={headingId} className="text-[15px] font-medium">
          Interview prep
        </h2>
        <p className="text-sm text-pretty text-muted">
          {prep
            ? "Answers are told from your own roles and projects, so they hold up when the interviewer asks for more. Read them aloud once or twice; don't learn them by heart."
            : interviewing
              ? "You have an interview for this one. Get a pitch, the questions they're likely to ask with answers from your own experience, how to talk about your gaps, and questions to ask them."
              : "When an interview comes up, get a pitch, the questions they're likely to ask with answers from your own experience, how to talk about your gaps, and questions to ask them."}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          {aiReady ? (
            <Button variant={prep ? "secondary" : "primary"} size="sm" aria-disabled={busy || undefined} onClick={() => !busy && prepare()}>
              {busy ? (job?.step ?? "Starting…") : prep ? "Write it again" : "Prepare for the interview"}
            </Button>
          ) : (
            <p className="text-meta text-muted">Interview prep needs an AI provider. Choose one in Settings → AI provider.</p>
          )}
          {prep && (
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              Copy all
            </Button>
          )}
        </div>
      </section>

      {prep && (
        <>
          <Card title="Tell me about yourself">
            <p className="text-field text-pretty whitespace-pre-line">{prep.pitch}</p>
            <Unverified items={prep.pitchUnverified} />
          </Card>

          <Card title="Likely questions">
            <ol className="flex flex-col">
              {prep.questions.map((entry, index) => (
                <li key={index} className="border-t border-line first:border-t-0">
                  <details className="group py-3" open={index === 0}>
                    <summary className="flex cursor-pointer list-none items-start gap-3 text-field font-medium marker:hidden">
                      <span aria-hidden className="w-5 flex-none text-muted tabular-nums">
                        {index + 1}.
                      </span>
                      <span className="flex-1 text-pretty">{entry.question}</span>
                    </summary>
                    <div className="flex flex-col gap-2 pt-2 pl-8 text-sm">
                      <p className="text-muted">
                        <span className="font-medium">Why they ask:</span> {entry.why}
                      </p>
                      {entry.from && <p className="text-meta text-muted">Your story, from {entry.from}:</p>}
                      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
                        {(["situation", "task", "action", "result"] as const).map((part) => (
                          <div key={part} className="contents">
                            <dt className="font-medium capitalize">{part}</dt>
                            <dd className="text-pretty">{entry.answer[part]}</dd>
                          </div>
                        ))}
                      </dl>
                      <Unverified items={entry.unverified} />
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </Card>

          {prep.gaps.length > 0 && (
            <Card title="Gaps, and how to talk about them">
              <ul className="flex flex-col gap-3">
                {prep.gaps.map((gap, index) => (
                  <li key={index} className="flex flex-col gap-0.5">
                    <p className="text-field font-medium">{gap.requirement}</p>
                    <p className="text-sm text-pretty">{gap.approach}</p>
                    <Unverified items={gap.unverified} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Questions to ask them">
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {prep.askThem.map((question, index) => (
                <li key={index} className="text-pretty">
                  {question}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex w-full max-w-[680px] flex-col gap-3 rounded-panel border border-line-card bg-card px-[30px] py-6">
      <h3 id={id} className="text-[15px] font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** What the fact guard couldn't find in the profile or the posting (E6-6), to check before saying it. */
function Unverified({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <p className="rounded-control bg-warning-surface px-3 py-2 text-meta text-warning">
      Check before you say it: {items.join(", ")} isn&apos;t in your profile or the posting.
    </p>
  );
}
