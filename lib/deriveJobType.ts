const WORKSHOP_JOB_TYPES = [
  "repair",
  "custom_order",
  "stock_work",
  "online_order",
  "collection_order",
];

export function deriveJobType(rawJobType: string | undefined, packetType: string | undefined): string {
  if (rawJobType && WORKSHOP_JOB_TYPES.includes(rawJobType)) return rawJobType;
  const pt = (packetType ?? "").toLowerCase();
  if (/online_order|online/.test(pt))       return "online_order";
  if (/collection_order|collection/.test(pt)) return "collection_order";
  if (/repair|service/.test(pt))            return "repair";
  if (/custom|bespoke|commission/.test(pt)) return "custom_order";
  if (/stock|internal/.test(pt))            return "stock_work";
  return "repair";
}
