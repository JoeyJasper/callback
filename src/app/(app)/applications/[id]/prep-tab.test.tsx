import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";
import type { InterviewPrep } from "@/lib/application-data";
import { copyText } from "@/lib/copy-text";

import { startInterviewPrep } from "./prep-actions";
import { PrepTab, prepText } from "./prep-tab";

vi.mock("./prep-actions", () => ({ startInterviewPrep: vi.fn(async () => ({ ok: true, data: "prep-job" })) }));
vi.mock("@/components/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// The job reports whatever the test says, as the real hook would.
const jobs = vi.hoisted(() => ({ listener: null as ((job: unknown) => void) | null }));
vi.mock("@/hooks/use-job", async () => {
  const { useEffect } = await import("react");
  return {
    useJob: (id: string | null, _revision: number, onChange?: (job: unknown) => void) => {
      useEffect(() => {
        jobs.listener = id ? (job) => onChange?.(job) : null;
      });
      return id ? { id, type: "interview-prep", status: "RUNNING", step: "Preparing your interview pack", error: null, result: null } : null;
    },
  };
});

const prep: InterviewPrep = {
  pitch: "I make complex tools calm.",
  questions: [
    {
      question: "Tell me about a design system you built.",
      why: "Whether you can build shared foundations.",
      answer: { situation: "Six teams drew their own components.", task: "Give them one system.", action: "I built it with them.", result: "Consistent screens." },
      from: "Senior Product Designer at Northwind Logistics",
      unverified: ["40%"],
    },
    { question: "Why payments?", why: "Motivation.", answer: { situation: "S", task: "T", action: "A", result: "R" }, from: "" },
  ],
  gaps: [{ requirement: "Accessibility (WCAG 2.2)", approach: "Say what you do today, and how you'd learn the rest." }],
  askThem: ["How does the team measure success?"],
};

beforeEach(() => vi.clearAllMocks());

describe("the Interview prep tab", () => {
  it("prepares the pack, follows the job and shows it once it's written", async () => {
    const user = userEvent.setup();
    render(<PrepTab applicationId="app-1" prep={null} preparing={null} aiReady interviewing />);
    expect(screen.getByText(/You have an interview for this one/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Prepare for the interview" }));
    expect(startInterviewPrep).toHaveBeenCalledWith({ id: "app-1" });
    expect(screen.getByRole("button", { name: "Preparing your interview pack" })).toHaveAttribute("aria-disabled", "true");
    act(() => jobs.listener?.({ id: "prep-job", status: "DONE", step: null, error: null, result: { written: true } }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("says why it failed", async () => {
    render(<PrepTab applicationId="app-1" prep={null} preparing="prep-job" aiReady interviewing={false} />);
    act(() => jobs.listener?.({ id: "prep-job", status: "FAILED", step: null, error: "The AI provider didn't answer.", result: null }));
    expect(toast).toHaveBeenCalledWith("The AI provider didn't answer.");
    expect(screen.getByRole("button", { name: "Prepare for the interview" })).toBeInTheDocument();
  });

  it("shows the pitch, STAR answers with where each story is from, what to check, the gaps and questions to ask", async () => {
    const user = userEvent.setup();
    render(<PrepTab applicationId="app-1" prep={prep} preparing={null} aiReady interviewing />);
    expect(screen.getByRole("region", { name: "Tell me about yourself" })).toHaveTextContent("I make complex tools calm.");
    const questions = screen.getByRole("region", { name: "Likely questions" });
    expect(within(questions).getByText("Your story, from Senior Product Designer at Northwind Logistics:")).toBeInTheDocument();
    expect(within(questions).getByText("I built it with them.")).toBeInTheDocument();
    expect(within(questions).getByText(/Check before you say it: 40%/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Gaps, and how to talk about them" })).toHaveTextContent("Accessibility (WCAG 2.2)");
    expect(screen.getByRole("region", { name: "Questions to ask them" })).toHaveTextContent("How does the team measure success?");

    await user.click(screen.getByRole("button", { name: "Copy all" }));
    expect(copyText).toHaveBeenCalledWith(prepText(prep));
    expect(toast).toHaveBeenCalledWith("Copied the interview prep.");
    expect(screen.getByRole("button", { name: "Write it again" })).toBeInTheDocument();
  });

  it("points to Settings without an AI provider", () => {
    render(<PrepTab applicationId="app-1" prep={null} preparing={null} aiReady={false} interviewing={false} />);
    expect(screen.getByText(/needs an AI provider/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prepare for the interview" })).not.toBeInTheDocument();
  });

  it("copies as plain text, every part in order", () => {
    const text = prepText(prep);
    expect(text).toMatch(/^Tell me about yourself\nI make complex tools calm\.\n\nLikely questions\n1\. Tell me about a design system you built\./);
    expect(text).toContain("   Result: Consistent screens.");
    expect(text).toContain("Gaps, and how to talk about them\n- Accessibility (WCAG 2.2): Say what you do today");
    expect(text).toMatch(/Questions to ask them\n- How does the team measure success\?$/);
  });
});
