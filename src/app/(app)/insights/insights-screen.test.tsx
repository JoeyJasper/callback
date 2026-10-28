import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { breakdowns, insights, rates, type OutcomeRow } from "@/lib/outcomes";

import { saveAgentSettings } from "../agent/actions";
import { InsightsScreen, type InsightsView } from "./insights-screen";

vi.mock("../agent/actions", () => ({ saveAgentSettings: vi.fn(async () => ({ ok: true, data: null })) }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));
vi.mock("next/navigation", () => ({ usePathname: () => "/insights" }));

let count = 0;
const row = (extra: Partial<OutcomeRow>): OutcomeRow => ({
  id: `a${++count}`,
  role: "Product Designer",
  company: "Acme",
  source: "pasted",
  tone: "WARM",
  fit: null,
  covered: null,
  keywords: null,
  format: null,
  sentAt: new Date("2026-09-01"),
  progressed: false,
  interviewed: false,
  rejected: false,
  replied: false,
  ...extra,
});
const rows = [
  ...Array.from({ length: 5 }, () => row({ fit: 90, progressed: true, interviewed: true })),
  ...Array.from({ length: 7 }, () => row({ role: "UX Researcher", fit: 55 })),
];
const view = (extra: Partial<InsightsView> = {}): InsightsView => ({
  waiting: 2,
  overall: rates(rows),
  insights: insights(rows),
  breakdowns: breakdowns(rows),
  suggestion: { score: 80, reason: "Applications scored 70–79 were answered once out of 7; from 80 up, 5 out of 5." },
  minScore: 70,
  learning: true,
  ...extra,
});

describe("Insights (outcome learning)", () => {
  it("shows the rates, what stands out and each breakdown", () => {
    render(<InsightsScreen view={view()} />);
    expect(screen.getByText("Applications counted").nextElementSibling).toHaveTextContent("12");
    expect(screen.getByText("2 more still waiting for an answer")).toBeInTheDocument();
    expect(screen.getAllByText("42%")).not.toHaveLength(0);
    const standing = screen.getByRole("region", { name: "What stands out" });
    expect(within(standing).getByText(/fit score of 85–100 were answered 5 times out of 5/)).toBeInTheDocument();
    const roles = screen.getByRole("region", { name: "Kind of role" });
    expect(within(roles).getByRole("rowheader", { name: "UX researcher" })).toBeInTheDocument();
  });

  it("applies the suggested minimum score and turns ranking by outcomes off", async () => {
    const user = userEvent.setup();
    render(<InsightsScreen view={view()} />);
    expect(screen.getByText(/A minimum of 80 fits that better\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use 80" }));
    expect(saveAgentSettings).toHaveBeenCalledWith({ minScore: 80 });
    await user.click(screen.getByRole("switch", { name: "Rank postings by what has worked for you" }));
    expect(saveAgentSettings).toHaveBeenCalledWith({ learn: false });
  });

  it("explains what it needs before there's enough to go on", () => {
    render(<InsightsScreen view={view({ overall: rates(rows.slice(0, 3)), insights: [], breakdowns: [], suggestion: null })} />);
    expect(screen.getByRole("heading", { name: "Not enough to go on yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Applications" })).toHaveAttribute("href", "/applications");
    expect(screen.queryByRole("region", { name: "What stands out" })).not.toBeInTheDocument();
    expect(screen.getByText(/A suggestion appears once enough scored applications/)).toBeInTheDocument();
  });
});
