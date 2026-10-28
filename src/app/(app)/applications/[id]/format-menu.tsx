"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { countryName } from "@/lib/job-search/countries";
import { formatForCountry, NO_FORMAT, RESUME_FORMATS, type ResumeFormat } from "@/lib/resume-formats";

/** The menu's value for following the job's country. */
const AUTO = "AUTO";

/**
 * "Gulf CV ▾" beside the Resume tab's theme: the resume's format by
 * country. It follows the job's country unless another is picked, or none.
 */
export function FormatMenu({
  chosen,
  country,
  onChange,
}: {
  /** Application.resumeFormat: a format, "NONE", or null to follow the job's country. */
  chosen: string | null;
  /** The job's country from the posting, if known. */
  country: string | null;
  onChange: (format: string | null) => void;
}) {
  const auto = formatForCountry(country);
  const current: ResumeFormat | null = chosen === NO_FORMAT ? null : chosen && chosen in RESUME_FORMATS ? RESUME_FORMATS[chosen as keyof typeof RESUME_FORMATS] : auto;
  const value = chosen ?? AUTO;
  const label = current ? current.name : "No country format";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="text" size="sm" aria-label={`Resume format: ${label}`} className="data-[state=open]:text-ink">
          {label}
          <span aria-hidden="true" className="text-[10px]">
            ▼
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto">
        <DropdownMenuLabel>Resume format, by where the job is</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => next !== value && onChange(next === AUTO ? null : next)}>
          <DropdownMenuRadioItem value={AUTO}>
            {country ? `The job's country (${countryName(country)})` : "The job's country"}
            {" "}
            <span className="text-meta text-muted">{auto ? auto.name : "no format for it"}</span>
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {Object.values(RESUME_FORMATS).map((format) => (
            <DropdownMenuRadioItem key={format.id} value={format.id}>
              {format.name}
              {" "}
              <span className="text-meta text-muted">{format.where}</span>
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuRadioItem value={NO_FORMAT}>None: the theme as it is</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
