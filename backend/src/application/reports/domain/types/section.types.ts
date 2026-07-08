import { SectionType } from '../enums/section-type.enum';
import { TestResult } from '../enums/test-result.enum';
import { TestType } from '../enums/test-type.enum';

/** A single test case, living inside a report's testing section. */
export interface TestCaseData {
  id: string;
  shortId: string;
  area: string;
  type: TestType | '';
  result: TestResult;
  owner: string;
  precondition?: string;
  testSteps?: string[];
  expectedResult?: string;
  actualResult?: string;
  note?: string;
}

export interface CoverageBar {
  label: string;
  percent: number;
}

export interface OverviewSection {
  id: string;
  type: SectionType.OVERVIEW;
  title: string;
  paragraphs: string[];
}
export interface ScreenshotSection {
  id: string;
  type: SectionType.SCREENSHOT;
  title: string;
  images: { src: string; alt?: string; caption?: string }[];
}
export interface CardsSection {
  id: string;
  type: SectionType.CARDS;
  title: string;
  intro?: string;
  cards: { name: string; desc: string }[];
}
export interface StepsSection {
  id: string;
  type: SectionType.STEPS;
  title: string;
  steps: { num: number; name: string; desc: string }[];
}
export interface BulletsSection {
  id: string;
  type: SectionType.BULLETS;
  title: string;
  intro?: string;
  items: string[];
}
export interface OrderedSection {
  id: string;
  type: SectionType.ORDERED;
  title: string;
  intro?: string;
  items: string[];
}
export interface TestingSection {
  id: string;
  type: SectionType.TESTING;
  title: string;
  banner?: { title: string; description: string };
  coverage: CoverageBar[];
  cases: TestCaseData[];
}

export type ReportSection =
  | OverviewSection
  | ScreenshotSection
  | CardsSection
  | StepsSection
  | BulletsSection
  | OrderedSection
  | TestingSection;
