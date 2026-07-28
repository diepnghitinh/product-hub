import type { DescriptionTemplate } from '@/components/DescriptionTemplates';

/**
 * Starter structures for a bug's description — the same idea as the backlog
 * item's User Story / JTBD templates (`roadmaps/backlogTemplates`), aimed at the
 * one thing that decides whether a bug is fixable: enough detail to reproduce
 * it. A report that says "checkout is broken" costs a developer an hour of
 * guessing; these fill in the questions they would have had to come back and ask.
 *
 * Four shapes, because a bug arrives in one of four ways: something is wrong
 * (Bug report), something that used to work stopped (Regression), something
 * blew up (Crash / Error), or something looks wrong (UI / Visual).
 */

const bugReport = (): string =>
  [
    '<h3>Summary</h3>',
    '<p>[One sentence: what is wrong, and where.]</p>',
    '<h3>Steps to reproduce</h3>',
    '<ol>',
    '<li>[Go to …]</li>',
    '<li>[Do …]</li>',
    '<li>[See …]</li>',
    '</ol>',
    '<h3>Expected result</h3>',
    '<p>[What should have happened.]</p>',
    '<h3>Actual result</h3>',
    '<p>[What happened instead.]</p>',
    '<h3>Environment</h3>',
    '<ul>',
    '<li><b>Build / version</b> — [e.g. 1.4.2, commit abc123]</li>',
    '<li><b>Device &amp; OS</b> — [e.g. iPhone 15, iOS 18 / Windows 11]</li>',
    '<li><b>Browser / app</b> — [e.g. Chrome 126]</li>',
    '<li><b>Account / role</b> — [who it happened to]</li>',
    '</ul>',
    '<h3>Evidence</h3>',
    '<p>[Screenshot, screen recording, log excerpt, request id.]</p>',
    '<h3>Impact &amp; workaround</h3>',
    '<ul>',
    '<li><b>Who is affected</b> — [everyone / one customer / one browser]</li>',
    '<li><b>How often</b> — [every time / intermittent, x in 10]</li>',
    '<li><b>Workaround</b> — [none, or what unblocks them meanwhile]</li>',
    '</ul>',
  ].join('');

const regression = (): string =>
  [
    '<h3>What broke</h3>',
    '<p>[The behaviour that used to work and now does not.]</p>',
    '<h3>Last known good</h3>',
    '<ul>',
    '<li><b>Worked on</b> — [version / date / environment]</li>',
    '<li><b>Broken on</b> — [version / date / environment]</li>',
    '</ul>',
    '<h3>Steps to reproduce</h3>',
    '<ol>',
    '<li>[Go to …]</li>',
    '<li>[Do …]</li>',
    '<li>[See …]</li>',
    '</ol>',
    '<h3>Expected (previous) behaviour</h3>',
    '<p>[What it did before.]</p>',
    '<h3>Suspected change</h3>',
    '<p>[Release, PR, config or data change that lines up with the break.]</p>',
    '<h3>Impact</h3>',
    '<ul>',
    '<li><b>Who is affected</b> — [scope]</li>',
    '<li><b>Rollback possible?</b> — [yes / no, and what it would cost]</li>',
    '</ul>',
  ].join('');

const crash = (): string =>
  [
    '<h3>What happened</h3>',
    '<p>[The action that triggered the crash or error.]</p>',
    '<h3>Error message</h3>',
    '<pre><code>[Paste the exact message, error code or status here.]</code></pre>',
    '<h3>Stack trace / log</h3>',
    '<pre><code>[Paste the relevant lines — trace, request id, correlation id.]</code></pre>',
    '<h3>Steps to reproduce</h3>',
    '<ol>',
    '<li>[Go to …]</li>',
    '<li>[Do …]</li>',
    '<li>[Crash / error appears]</li>',
    '</ol>',
    '<h3>Frequency</h3>',
    '<p>[Every time / intermittent — how many attempts out of how many.]</p>',
    '<h3>Environment</h3>',
    '<ul>',
    '<li><b>Build / version</b> — [ ]</li>',
    '<li><b>Device &amp; OS</b> — [ ]</li>',
    '<li><b>When it started</b> — [timestamp, with timezone]</li>',
    '</ul>',
    '<h3>Impact</h3>',
    '<p>[Data lost? Users blocked? Is there a workaround?]</p>',
  ].join('');

const uiVisual = (): string =>
  [
    '<h3>What looks wrong</h3>',
    '<p>[The element and the screen it is on — e.g. "Save button overlaps the footer on the settings page".]</p>',
    '<h3>Where</h3>',
    '<ul>',
    '<li><b>Page / screen</b> — [ ]</li>',
    '<li><b>Screen size</b> — [mobile / tablet / desktop, plus width if known]</li>',
    '<li><b>Browser &amp; OS</b> — [ ]</li>',
    '<li><b>Theme</b> — [light / dark]</li>',
    '</ul>',
    '<h3>Expected</h3>',
    '<p>[What it should look like — link the design or the reference screen.]</p>',
    '<h3>Screenshot</h3>',
    '<p>[Paste the screenshot here — annotated if the difference is subtle.]</p>',
    '<h3>Impact</h3>',
    '<p>[Cosmetic, hard to read, or does it actually block the task?]</p>',
  ].join('');

export const BUG_TEMPLATES: DescriptionTemplate[] = [
  { id: 'bug-report', labelKey: 'bugs.templateReport', hintKey: 'bugs.templateReportHint', buildHtml: bugReport },
  { id: 'regression', labelKey: 'bugs.templateRegression', hintKey: 'bugs.templateRegressionHint', buildHtml: regression },
  { id: 'crash', labelKey: 'bugs.templateCrash', hintKey: 'bugs.templateCrashHint', buildHtml: crash },
  { id: 'ui-visual', labelKey: 'bugs.templateUiVisual', hintKey: 'bugs.templateUiVisualHint', buildHtml: uiVisual },
];
