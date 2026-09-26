/**
 * jewellery_v1 lives with the bridge so a detected printer DPI can rebuild the
 * same ZPL at print time. This re-export is what the print API stores on the job.
 */
export {
  generateJewelleryZpl,
  tagGeometry,
  mmToDots,
  dotsPerMm,
  normalizeDpi,
  DEFAULT_DPI,
  LABEL_WIDTH_MM,
  LABEL_LENGTH_MM,
  type LabelData,
  type TagGeometry,
} from "../vault-rfid-bridge/src/label";

export {
  FRONT_FIELDS,
  frontCopyLines,
  formatDetail,
  placeBack,
  placeFrontLines,
  resolveStoneShape,
  truncateToWidth,
  type FlagBox,
  type PlacedLine,
  type TagCopy,
} from "../vault-rfid-bridge/src/tag-layout";
