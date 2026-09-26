import { wedgeToken } from "../lib/wedge-burst.ts";

function keys(text: string, start: number, gap: number) {
  return text.split("").map((key, index) => ({ at: start + index * gap, key }));
}

const epc = "0cfa57ce60c580f65588501e";
const fast = keys(epc, 1000, 8);
const found = wedgeToken(fast, fast[fast.length - 1].at + 8);
if (found !== epc) throw new Error(`fast epc: ${found}`);

const typed = keys("ring", 1000, 180);
if (wedgeToken(typed, typed[typed.length - 1].at + 40) !== null) throw new Error("slow typing looked like a wedge");

const paused = [
  { at: 0, key: "r" },
  { at: 200, key: "i" },
  ...keys("ABCD", 1000, 8),
];
const suffix = wedgeToken(paused, 1000 + 24 + 8);
if (suffix !== "ABCD") throw new Error(`suffix burst: ${suffix}`);

const lateEnter = keys("RING-01", 1000, 8);
if (wedgeToken(lateEnter, lateEnter[lateEnter.length - 1].at + 400) !== null) {
  throw new Error("a pause before Enter should stay a search");
}

console.log("wedge-burst-test: ok");
