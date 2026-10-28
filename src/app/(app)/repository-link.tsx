"use client";

import { ArrowUpRight, Code, Star } from "lucide-react";

import { cn } from "@/lib/cn";
import { REPOSITORY_URL } from "@/lib/releases";

import { useSidebarCollapsed } from "./sidebar-frame";

const LABEL = "Star on GitHub";

/**
 * The sidebar's link to Callback's repository, for credits and support; on a
 * changed copy run for others, to that copy's source code instead.
 */
export function RepositoryLink({ sourceUrl = null }: { sourceUrl?: string | null }) {
  const collapsed = useSidebarCollapsed();
  const label = sourceUrl ? "Source code" : LABEL;
  const Icon = sourceUrl ? Code : Star;
  return (
    <a
      href={sourceUrl ?? REPOSITORY_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={collapsed ? label : undefined}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-muted hover:bg-hover hover:text-ink motion-safe:transition-colors",
        collapsed && "justify-center px-1.5",
      )}
    >
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      <span className={cn(collapsed && "sr-only")}>{label}</span>{" "}
      <span className="sr-only">(opens in a new tab)</span>
      {!collapsed && <ArrowUpRight size={14} aria-hidden="true" className="ml-auto shrink-0" />}
    </a>
  );
}
