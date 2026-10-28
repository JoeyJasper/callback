"use client";

import { ScreenError, type ErrorPageProps } from "@/components/screen-error";

export default function InsightsError(props: ErrorPageProps) {
  return <ScreenError {...props} title="Insights didn't load" />;
}
