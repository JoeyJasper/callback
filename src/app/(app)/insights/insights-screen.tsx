"use client";

import Link from "next/link";
import { useTransition, type ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/cn";
import { MIN_GROUP, SETTLE_DAYS, type Breakdown, type Insight, type MinScoreSuggestion, type Rates } from "@/lib/outcomes";

import { saveAgentSettings } from "../agent/actions";

export type InsightsView = {
  /** Sent, but too recently to count. */
  waiting: number;
  overall: Rates;
  insights: Insight[];
  breakdowns: Breakdown[];
  suggestion: MinScoreSuggestion | null;
  minScore: number;
  learning: boolean;
};

const percent = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

/**
 * Insights (outcome learning): the user's answer and interview rates, what
 * stands out, a better minimum score for the job agent, and each breakdown.
 */
export function InsightsScreen({ view }: { view: InsightsView }) {
  const [pending, startTransition] = useTransition();
  const { overall } = view;
  const enough = overall.sent >= MIN_GROUP * 2;

  const save = (changes: { minScore?: number; learn?: boolean }) =>
    startTransition(async () => {
      toastResult(await saveAgentSettings(changes));
    });

  return (
    <>
      <PageHeader
        title="Insights"
        description={`What your applications have in common when employers answer, from the ones sent at least ${SETTLE_DAYS} days ago or answered since. The job agent uses it to rank what it finds.`}
      />
      <div className="flex flex-col gap-8 px-10 pb-20">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile label="Applications counted" value={String(overall.sent)} note={view.waiting > 0 ? `${view.waiting} more still waiting for an answer` : undefined} />
          <Tile label="Answered" value={percent(overall.answerRate)} note={`${overall.answered} of ${overall.sent}: moved on, turned down or wrote back`} />
          <Tile label="Got an interview" value={percent(overall.interviewRate)} note={`${overall.interviews} of ${overall.sent}`} />
        </div>

        {!enough ? (
          <Card className="flex flex-col gap-2">
            <h2 className="text-[15px] font-medium">Not enough to go on yet</h2>
            <p className="text-sm text-pretty text-muted">
              This fills in once about {MIN_GROUP * 2} applications have been sent and have had time for an answer. Keep each application&apos;s
              status up to date (Sent, Screening, Interview, Rejected…) on{" "}
              <Link href="/applications" className="text-ink underline underline-offset-2">
                Applications
              </Link>
              , since that&apos;s what this learns from. With Gmail connected, employers&apos; replies count too.
            </p>
          </Card>
        ) : (
          <section aria-labelledby="standing-out" className="flex flex-col gap-3">
            <h2 id="standing-out" className="font-serif text-section">
              What stands out
            </h2>
            {view.insights.length === 0 ? (
              <p className="rounded-card border border-line-card bg-card px-5 py-4 text-sm text-muted">
                Nothing stands out yet: no group of {MIN_GROUP} or more does clearly better or worse than the rest.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {view.insights.map((insight, index) => (
                  <li
                    key={index}
                    className={cn(
                      "rounded-card border px-5 py-3.5 text-sm",
                      insight.tone === "good" ? "border-line-card bg-card text-ink" : "border-warning-line bg-warning-surface text-warning",
                    )}
                  >
                    <span className="sr-only">{insight.tone === "good" ? "Works for you: " : "Works less well: "}</span>
                    {insight.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-labelledby="agent-learning" className="flex flex-col gap-3">
          <h2 id="agent-learning" className="font-serif text-section">
            The job agent
          </h2>
          <Card className="flex flex-col gap-4">
            <Toggle
              label="Rank postings by what has worked for you"
              description="Postings for kinds of roles that got you answers move up the Agent screen and get drafts first; ones that never did move down. The minimum score itself doesn't change unless you change it."
              checked={view.learning}
              disabled={pending}
              onCheckedChange={(learn) => save({ learn })}
            />
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <p className="text-sm">
                Minimum score: <span className="font-medium">{view.minScore}</span>
              </p>
              {view.suggestion ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-warning-surface px-4 py-3">
                  <p className="text-sm text-pretty text-warning">
                    {view.suggestion.reason} A minimum of {view.suggestion.score} fits that better.
                  </p>
                  <Button variant="secondary" size="sm" aria-disabled={pending || undefined} onClick={() => !pending && save({ minScore: view.suggestion!.score })}>
                    Use {view.suggestion.score}
                  </Button>
                </div>
              ) : (
                <p className="text-meta text-muted">
                  {enough ? "Your scored applications don't point to a better minimum." : "A suggestion appears once enough scored applications have had an answer."}
                </p>
              )}
            </div>
          </Card>
        </section>

        {enough &&
          view.breakdowns.map((breakdown) => (
            <BreakdownTable key={breakdown.dimension} breakdown={breakdown} base={overall.answerRate ?? 0} />
          ))}
      </div>
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <Card padding="none" className="flex flex-col gap-1 px-6 py-5">
      <p className="text-meta text-muted">{label}</p>
      <p className="font-serif text-[30px] leading-none tabular-nums">{value}</p>
      {note && <p className="text-meta text-pretty text-muted">{note}</p>}
    </Card>
  );
}

/** One breakdown: each group's applications, answers and interviews, with a bar against the overall rate. */
function BreakdownTable({ breakdown, base }: { breakdown: Breakdown; base: number }) {
  const id = `breakdown-${breakdown.dimension}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-serif text-section">
        {breakdown.label}
      </h2>
      <Card padding="none" className="overflow-x-auto px-6 py-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-meta text-muted">
              <th scope="col" className="py-2.5 pr-4 font-normal">
                Group
              </th>
              <th scope="col" className="py-2.5 pr-4 text-right font-normal">
                Sent
              </th>
              <th scope="col" className="w-[40%] py-2.5 pr-4 font-normal">
                Answered
              </th>
              <th scope="col" className="py-2.5 text-right font-normal">
                Interviews
              </th>
            </tr>
          </thead>
          <tbody>
            {breakdown.groups.map((group) => {
              const rate = group.answerRate ?? 0;
              return (
                <tr key={group.key} className={cn("border-t border-line", !group.enough && "text-muted")}>
                  <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                    {group.name}
                    {!group.enough && <span className="block text-xs">Too few to tell</span>}
                  </th>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{group.sent}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2.5">
                      <div aria-hidden className="relative h-2 flex-1 rounded-full bg-track">
                        <div
                          className={cn("absolute inset-y-0 left-0 rounded-full", rate >= base ? "bg-primary" : "bg-line-strong")}
                          style={{ width: `${Math.round(rate * 100)}%` }}
                        />
                        <div className="absolute inset-y-[-3px] w-px bg-ink" style={{ left: `${Math.round(base * 100)}%` }} />
                      </div>
                      <span className="w-[4.5ch] text-right tabular-nums">{percent(group.answerRate)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{group.interviews}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-line py-2.5 text-xs text-muted">The thin line marks your overall answer rate, {percent(base)}.</p>
      </Card>
    </section>
  );
}
