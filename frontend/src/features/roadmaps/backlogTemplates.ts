import type { I18nKey } from '@/i18n/en';

/**
 * Starter structures for a backlog item's description. Each builds plain HTML —
 * the same format `RichTextEditor` round-trips (see `lib/editorjs`) — using only
 * blocks the editor supports (headings, paragraphs, lists, bold). Applying one
 * fills an empty item so the writer starts from a proven shape instead of a blank
 * page, per the Scrum / JTBD framing this product is built around.
 */
export interface BacklogTemplate {
  id: 'user-story' | 'jtbd';
  labelKey: I18nKey;
  hintKey: I18nKey;
  buildHtml: () => string;
}

const userStory = (): string =>
  [
    '<h3>User story</h3>',
    '<p>As a <b>[type of user]</b>, I want <b>[capability]</b>, so that <b>[benefit / outcome]</b>.</p>',
    '<h3>Acceptance criteria</h3>',
    '<ul>',
    '<li>Given [context], when [action], then [result].</li>',
    '<li>…</li>',
    '</ul>',
    '<h3>INVEST check</h3>',
    '<ul>',
    '<li><b>Independent</b> — can be built and shipped on its own.</li>',
    '<li><b>Negotiable</b> — a starting point for conversation, not a fixed contract.</li>',
    '<li><b>Valuable</b> — delivers clear value to a user or the business.</li>',
    '<li><b>Estimable</b> — the team can size it with confidence.</li>',
    '<li><b>Small</b> — fits comfortably inside one sprint.</li>',
    '<li><b>Testable</b> — has clear, verifiable acceptance criteria.</li>',
    '</ul>',
  ].join('');

const jtbd = (): string =>
  [
    '<h3>Job story</h3>',
    '<p>When <b>[situation]</b>, I want to <b>[motivation]</b>, so I can <b>[expected outcome]</b>.</p>',
    '<h3>Context &amp; struggle</h3>',
    "<p>[What triggers this job today? What's frustrating about how it's handled now?]</p>",
    '<h3>Forces of progress</h3>',
    '<ul>',
    "<li><b>Push</b> — what pushes them away from today's approach.</li>",
    '<li><b>Pull</b> — what attracts them to a new one.</li>',
    '<li><b>Anxiety</b> — what worries them about switching.</li>',
    '<li><b>Habit</b> — what keeps them with the status quo.</li>',
    '</ul>',
    '<h3>Success looks like</h3>',
    '<ul>',
    '<li>[A measurable outcome that proves the job is done well.]</li>',
    '</ul>',
  ].join('');

export const BACKLOG_TEMPLATES: BacklogTemplate[] = [
  {
    id: 'user-story',
    labelKey: 'roadmaps.templateUserStory',
    hintKey: 'roadmaps.templateUserStoryHint',
    buildHtml: userStory,
  },
  {
    id: 'jtbd',
    labelKey: 'roadmaps.templateJtbd',
    hintKey: 'roadmaps.templateJtbdHint',
    buildHtml: jtbd,
  },
];
