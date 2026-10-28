import "server-only";

import { loadDocuments } from "@/lib/application-documents";
import { expectedFrom, printedHeadings, readBack, type ParseResult } from "@/lib/ats";
import { documentLabels } from "@/lib/document-labels";
import { renderPdf } from "@/lib/pdf/render";
import { resumeContent } from "@/lib/resume-content";
import { resumePhoto } from "@/lib/resume-formats";
import { resolveTheme, withoutSidebar } from "@/lib/themes";

/** The text a parser gets from a PDF, all pages in order. */
export async function pdfText(pdf: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // Chromium's PDFs come as a Node Buffer, which pdf.js refuses: it wants plain bytes.
  const bytes = new Uint8Array(pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength));
  return (await extractText(await getDocumentProxy(bytes), { mergePages: true })).text;
}

/**
 * The ATS read-back of an application's tailored resume: renders the PDF
 * exactly as Download PDF does, reads its text the way a parser would and
 * compares it with what the resume shows. Null without a tailored resume.
 */
export async function checkResumePdf(id: string): Promise<ParseResult | null> {
  const { application, profile, resume, includeReferences, format } = await loadDocuments(id);
  if (!resume) return null;
  const labels = documentLabels(application.language);
  const content = resumeContent(profile, { units: resume.units, includeReferences, showPhoto: resumePhoto(application.showPhoto, format), format }, labels);
  const layout = resolveTheme(resume.theme, application.followThemeLayout ? undefined : withoutSidebar(resume.theme.layout));
  const text = await pdfText(await renderPdf(`/print/resume/${id}`));
  return readBack(text, expectedFrom(content, printedHeadings(content, labels, layout), profile.basics), { sidebar: layout.split });
}
