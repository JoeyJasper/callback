import type { Metadata } from "next";

import { breakdowns, insights, rates, settled, suggestMinScore } from "@/lib/outcomes";
import { loadOutcomeRows } from "@/lib/outcomes-data";
import { loadSettings } from "@/lib/settings-data";

import { InsightsScreen } from "./insights-screen";

export const metadata: Metadata = { title: "Insights" };

/**
 * Insights (outcome learning): which of the user's applications got answers
 * and interviews, what they had in common, and what that means for the job agent.
 */
export default async function InsightsPage() {
  const now = new Date();
  const [all, settings] = await Promise.all([loadOutcomeRows({ now, all: true }), loadSettings()]);
  const rows = all.filter((row) => settled(row, now));
  return (
    <InsightsScreen
      view={{
        waiting: all.length - rows.length,
        overall: rates(rows),
        insights: insights(rows),
        breakdowns: breakdowns(rows),
        suggestion: suggestMinScore(rows, settings.agentMinScore),
        minScore: settings.agentMinScore,
        learning: settings.agentLearn,
      }}
    />
  );
}
