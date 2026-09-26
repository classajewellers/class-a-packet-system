/**
 * Preview DPI follows the printer check. Run:
 *   npx tsx scripts/preview-layout-test.ts
 */
import { previewDpiCaption, previewLayoutFromCheck } from "../lib/rfid-preview-layout.ts";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const unknown = previewLayoutFromCheck(null);
assert(unknown.dpi === 203 && unknown.dpiKnown === false, "unknown falls back to 203");
assert(previewDpiCaption(unknown) === "at 203 dpi", previewDpiCaption(unknown));

const reported = previewLayoutFromCheck({
  summary: { dpi: 300 },
  bridge_overrides: { labelLengthDots: 425, tagHeadTopMm: 8.7, tagHeadLeftMm: 0.5 },
});
assert(reported.dpi === 300 && reported.dpiKnown, "reported head dpi");
assert(reported.lengthDots === 425, "length override");
assert(reported.headTopMm === 8.7, "head top");
assert(previewDpiCaption(reported) === "at 300 dpi", previewDpiCaption(reported));

const override = previewLayoutFromCheck({
  summary: { dpi: 300 },
  bridge_overrides: { dpi: 203 },
});
assert(override.dpi === 203 && override.dpiKnown, "config dpi wins and is still known");
assert(previewDpiCaption(override) === "at 203 dpi", "known 203 uses the real value");

const headOnly = previewLayoutFromCheck(null, 600);
assert(headOnly.dpi === 600 && headOnly.dpiKnown, "head_dpi column");

const junk = previewLayoutFromCheck({ summary: { dpi: "nope" } });
assert(junk.dpiKnown === false && junk.dpi === 203, "unreadable dpi stays unknown");

console.log("preview-layout-test: ok");
