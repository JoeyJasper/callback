import Link from "next/link";

import type { ResumeFormat } from "@/lib/resume-formats";

import { sectionHref } from "../../profile/sections";

/** Above a resume whose format asks for personal details the profile doesn't have yet (resume formats). */
export function FormatNotice({ format, missing }: { format: ResumeFormat; missing: string[] }) {
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}`;
  return (
    <p role="note" className="rounded-card bg-warning-surface px-4 py-2.5 text-meta text-pretty text-warning">
      A {format.name} usually shows your {list.toLowerCase()}.{" "}
      <Link href={sectionHref("basics")} className="font-medium text-warning underline underline-offset-2">
        Add {missing.length === 1 ? "it" : "them"} in your profile
      </Link>{" "}
      and {missing.length === 1 ? "it shows" : "they show"} here.
    </p>
  );
}
