import { expect, test } from "@playwright/test";

import { resetData } from "./support";

// The interview layer, end to end with the fake AI: the evidence matcher, the
// ATS check with a real PDF read back, interview prep, resume formats by
// country and Insights.
test.beforeAll(resetData);

const POSTING = `Ledgerly: Senior Product Designer, Payments
Amsterdam (hybrid, 3 days in office) · €75,000–€90,000

What we're looking for
- 5+ years of product design
- You've built or maintained a design system
- Strong prototyping skills in Figma
- You mentor junior designers
- Experience with Kubernetes
- Dutch is a plus`;

test("matches with evidence, checks the resume like an ATS, prepares the interview and formats the resume by country", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/new?fresh=1");
  await page.getByLabel("Job posting").fill(POSTING);
  await page.getByRole("button", { name: "Read the posting →" }).click();

  // The evidence matcher: the line from the profile that shows mentoring, though no skill names it.
  const match = page.getByRole("list", { name: "Requirements" });
  await expect(match.getByText("Mentors junior designers")).toBeVisible();
  await expect(match.getByText("“Mentored three junior designers through their first year”")).toBeVisible();
  await expect(match.getByText("· nice to have")).toBeVisible();

  await page.getByRole("button", { name: "Create application →" }).click();
  await page.waitForURL(/\/applications\/c/, { timeout: 30_000 });

  // The ATS check: keyword coverage, then the real PDF read back.
  await page.getByRole("tab", { name: /^ATS check · \d+%$/ }).click();
  await expect(page.getByRole("heading", { name: "The posting's keywords" })).toBeVisible();
  await expect(page.getByText(/“Kubernetes”/)).toBeVisible();
  await page.getByRole("button", { name: "Test-read the PDF" }).click();
  await expect(page.getByText(/A parser reads this PDF cleanly/)).toBeVisible({ timeout: 45_000 });

  // Interview prep.
  await page.getByRole("tab", { name: "Interview prep" }).click();
  await page.getByRole("button", { name: "Prepare for the interview" }).click();
  await expect(page.getByRole("region", { name: "Likely questions" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Tell me about a design system you built or maintained.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Gaps, and how to talk about them" })).toContainText("Experience with Kubernetes");

  // A Gulf CV: personal details on the resume, and a note on what the profile lacks.
  await page.getByRole("tab", { name: "Resume" }).click();
  await page.getByRole("button", { name: /^Resume format:/ }).click();
  await page.getByRole("menuitemradio", { name: /^Gulf CV/ }).click();
  const resume = page.getByRole("article", { name: "Resume" });
  await expect(resume.getByRole("heading", { name: "Professional summary" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("A Gulf CV usually shows your nationality, visa status");
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume format: Gulf CV" })).toBeVisible();
});

test("Insights says what it needs before there's enough to go on", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByRole("heading", { level: 1, name: "Insights" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Rank postings by what has worked for you" })).toBeChecked();
});
