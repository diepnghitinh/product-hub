/** The seven report section types (docs/specs/01 §4). */
export enum SectionType {
  OVERVIEW = 'overview',
  SCREENSHOT = 'screenshot',
  CARDS = 'cards',
  STEPS = 'steps',
  BULLETS = 'bullets',
  ORDERED = 'ordered',
  TESTING = 'testing',
}

export const SECTION_TYPES: SectionType[] = [
  SectionType.OVERVIEW,
  SectionType.SCREENSHOT,
  SectionType.CARDS,
  SectionType.STEPS,
  SectionType.BULLETS,
  SectionType.ORDERED,
  SectionType.TESTING,
];
