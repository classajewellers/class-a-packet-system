import { generateJewelleryZpl, tagGeometry } from "../vault-rfid-bridge/src/label.ts";
import { frontCopyLines, placeFrontLines, truncateToWidth } from "../vault-rfid-bridge/src/tag-layout.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const stone = frontCopyLines({
  sku: "CA-ENG-0142",
  metal: "18K White",
  carat: 0.5,
  shape: "oval",
  diamondType: "Lab Grown",
  fingerSize: "N",
});
assert(stone.map((line) => line.text).join(" | ") === "CA-ENG-0142 | 18K White | 0.50ct Oval Lab", stone.map((line) => line.text).join(" | "));
assert(stone[0].bold === true, "sku should be the bold line");

const sized = frontCopyLines({
  sku: "RING-09",
  metal: "18K White",
  carat: null,
  shape: null,
  diamondType: "None",
  fingerSize: "N",
});
assert(sized[2].text === "Size N", sized[2].text);

const empty = frontCopyLines({
  sku: "RING-02",
  metal: "18K White",
  carat: null,
  shape: null,
  diamondType: null,
  fingerSize: null,
});
assert(empty[2].text === "", `expected a blank detail line, got "${empty[2].text}"`);

const geo = tagGeometry(203);
const longSku = "RFID-TEST-001-EXTRA-LONG-CODE-THAT-CANNOT-FIT-ON-THE-FLAG";
const longPlaced = placeFrontLines(geo.top, geo.dpi, {
  sku: longSku,
  metal: "18K Yellow",
  carat: null,
  shape: null,
  fingerSize: null,
});
assert(longPlaced[0].text.endsWith("..."), `long sku was not truncated: ${longPlaced[0].text}`);
assert(longPlaced[0].text.length < longSku.length, "truncated sku should be shorter");
assert(!longPlaced[0].text.includes(" "), "sku line should stay one line");

const longDetail = placeFrontLines(geo.top, geo.dpi, {
  sku: "CA-ENG-0142",
  metal: "18K Yellow Gold With A Very Long Metal Description That Will Not Fit",
  carat: 0.5,
  shape: "Oval Cut With Extra Words That Will Not Fit On This Flag At All",
  diamondType: "Lab Grown",
  fingerSize: "N",
});
const metal = longDetail.find((line) => line.key === "metal");
const detail = longDetail.find((line) => line.key === "detail");
assert(metal && metal.text.endsWith("..."), `metal was not truncated: ${metal?.text}`);
assert(detail && detail.text.endsWith("..."), `stone was not truncated: ${detail?.text}`);
assert(detail?.text.startsWith("0.50ct"), `stone line lost its carat: ${detail?.text}`);

const narrow = truncateToWidth("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 20, 40);
assert(narrow.endsWith("..."), narrow);
assert(narrow.length < 26, narrow);

const zpl = generateJewelleryZpl({
  epc: "0123456789abcdef01234567",
  sku: "RING-02",
  metal: "18K White",
  dpi: 300,
  lengthDots: 425,
});
const header = [
  "^XA",
  "^MUD",
  "^MMT",
  "^PW803",
  "^LL425",
  "^LH0,0",
  "^LT0",
  "^LS0",
  "^CI28",
  "^RFW,H,2,12,1^FD0123456789abcdef01234567^FS",
].join("\n");
assert(zpl.startsWith(header), "encode header changed");
assert(zpl.includes("^FO24,121^A0N,50,50^FB259,1,0,C,0^FDRING-02^FS"), "top flag origin moved");
assert(zpl.includes("^FO92,274^A0I,28,28^FDRING-02^FS"), "back sku moved");
assert(zpl.includes("^FO41,306^BY2,2,86^BCI,86,N,N,N^FDRING-02^FS"), "back barcode moved");
assert(!zpl.includes("$") && !zpl.toLowerCase().includes("retail"), "price is still on the tag");

const locked = tagGeometry(300, 0, 0, undefined, 425);
assert(locked.headLeft === 6 && locked.headRight === 301, "head x changed");
assert(locked.headTop === 103 && locked.headBottom === 410, "head y changed");
assert(locked.fold === 256, "fold moved");
assert(locked.top.x === 24 && locked.top.y === 121, "top flag origin changed");
assert(locked.bottom.x === 24 && locked.bottom.y === 274, "back flag origin changed");
assert(locked.labelLength === 425, "label length changed");

const stoneZpl = generateJewelleryZpl({
  epc: "0123456789abcdef01234567",
  sku: "CA-ENG-0142",
  metal: "18K White",
  carat: 0.5,
  shape: "Oval",
  diamondType: "Lab",
  fingerSize: "N",
});
assert(stoneZpl.includes("0.50ct Oval Lab"), stoneZpl);
assert(!stoneZpl.includes("^RFW,H") || stoneZpl.includes("^RFW,H,2,12,1^FD"), "encode command changed");

console.log("tag-layout-test: ok");
