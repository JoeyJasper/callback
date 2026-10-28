import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";
import type { Requirement } from "@/lib/application-data";
import type { ParseResult } from "@/lib/ats";
import { demoProfile, demoResumeUnits } from "@/lib/demo-profile";

import { testReadResume } from "./ats-actions";
import { addTermsRequest, AtsTab, resumeCoverage } from "./ats-tab";

vi.mock("./ats-actions", () => ({ testReadResume: vi.fn() }));
vi.mock("@/components/toast", () => ({ toast: vi.fn() }));

const requirements: Requirement[] = [
  { text: "Prototyping in Figma", kind: "skill", skill: "Figma", years: null, language: null, keywords: ["Figma"] },
  { text: "Stakeholder management", kind: "skill", skill: "Stakeholder management", years: null, language: null },
  { text: "Kubernetes", kind: "skill", skill: "Kubernetes", years: null, language: null },
  { text: "Dutch is a plus", kind: "language", skill: null, years: null, language: "Dutch", mustHave: false },
];
const match = {
  items: requirements.map((requirement, index) => ({
    requirement: requirement.text,
    result: index === 2 ? ("gap" as const) : ("covered" as const),
    skill: null,
    experienceIds: [],
    note: null,
  })),
};
const coverage = resumeCoverage({
  profile: demoProfile(),
  units: demoResumeUnits(),
  language: "English",
  includeReferences: false,
  showPhoto: null,
  requirements,
  match,
});
const clean: ParseResult = { score: 100, intact: { count: 10, total: 10 }, recovered: 1, issues: [] };

describe("the ATS check tab", () => {
  beforeEach(() => vi.mocked(testReadResume).mockReset());

  it("shows the required terms found, what the profile backs but the resume lacks, and the nice-to-haves", () => {
    render(<AtsTab applicationId="app-1" coverage={coverage} aiReady unitsKey="v1" onAskToAdd={vi.fn()} />);
    expect(coverage.score).toBe(33);
    expect(screen.getByRole("img", { name: "Score 33 of 100" })).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 required terms are in your resume/)).toBeInTheDocument();
    expect(screen.getByText("1 term your profile backs is missing.")).toBeInTheDocument();
    expect(screen.getByText(/Stakeholder management\. Your profile shows it/)).toBeInTheDocument();
    expect(screen.getByText(/Kubernetes\. Not in your profile, so it stays out/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nice to have" })).toBeInTheDocument();
  });

  it("asks the AI to work in only the terms the profile backs", async () => {
    const user = userEvent.setup();
    const onAskToAdd = vi.fn();
    render(<AtsTab applicationId="app-1" coverage={coverage} aiReady unitsKey="v1" onAskToAdd={onAskToAdd} />);
    await user.click(screen.getByRole("button", { name: "Ask AI to work it in" }));
    expect(onAskToAdd).toHaveBeenCalledWith(addTermsRequest([coverage.items[1]]));
    expect(onAskToAdd.mock.calls[0][0]).toMatch(/“Stakeholder management” \(for: Stakeholder management\)/);
    expect(onAskToAdd.mock.calls[0][0]).not.toMatch(/Kubernetes/);
    expect(onAskToAdd.mock.calls[0][0]).toMatch(/don't add anything my profile doesn't show/);
  });

  it("hides the AI button without an AI provider", () => {
    render(<AtsTab applicationId="app-1" coverage={coverage} aiReady={false} unitsKey="v1" onAskToAdd={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Ask AI/ })).not.toBeInTheDocument();
  });

  it("test-reads the PDF and shows a clean result, then marks it stale once the resume changes", async () => {
    vi.mocked(testReadResume).mockResolvedValue({ ok: true, data: clean });
    const user = userEvent.setup();
    const { rerender } = render(<AtsTab applicationId="app-1" coverage={coverage} aiReady unitsKey="v1" onAskToAdd={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Test-read the PDF" }));
    expect(testReadResume).toHaveBeenCalledWith({ id: "app-1" });
    expect(await screen.findByText(/A parser reads this PDF cleanly/)).toBeInTheDocument();
    expect(screen.getByText("10 of 10 lines come out in one piece. 100% of your words come out as text.")).toBeInTheDocument();
    rerender(<AtsTab applicationId="app-1" coverage={coverage} aiReady unitsKey="v2" onAskToAdd={vi.fn()} />);
    expect(screen.getByText("The resume changed since this check. Test-read it again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test-read it again" })).toBeInTheDocument();
  });

  it("lists the problems with how to fix each, and shows errors from the server", async () => {
    const user = userEvent.setup();
    vi.mocked(testReadResume).mockResolvedValueOnce({ ok: false, error: "This application has no tailored resume to check." });
    render(<AtsTab applicationId="app-1" coverage={coverage} aiReady unitsKey="v1" onAskToAdd={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Test-read the PDF" }));
    expect(toast).toHaveBeenCalledWith("This application has no tailored resume to check.");

    vi.mocked(testReadResume).mockResolvedValueOnce({
      ok: true,
      data: { ...clean, score: 60, issues: [{ severity: "error", message: "Only 4 of 10 lines come out in one piece.", fix: "Turn off “Sidebar layout” above the resume." }] },
    });
    await user.click(screen.getByRole("button", { name: "Test-read the PDF" }));
    const problems = await screen.findByRole("list", { name: "Problems found" });
    expect(within(problems).getByText(/Only 4 of 10 lines/)).toBeInTheDocument();
    expect(within(problems).getByText("Turn off “Sidebar layout” above the resume.")).toBeInTheDocument();
  });

  it("says when the posting names nothing to look for", () => {
    const none = resumeCoverage({ profile: demoProfile(), units: demoResumeUnits(), language: "English", includeReferences: false, showPhoto: null, requirements: [], match: null });
    render(<AtsTab applicationId="app-1" coverage={none} aiReady unitsKey="v1" onAskToAdd={vi.fn()} />);
    expect(screen.getByText(/The posting names no skills or terms to look for/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Score/ })).not.toBeInTheDocument();
  });
});
