import { docBodyToHtml, stripEchoedTitle } from './mcp-doc-body';

/**
 * The converter that stands between what an assistant writes and what the editor
 * stores. Its failures are silent — a body that isn't understood is kept as
 * paragraph text, which looks like a plain page rather than a bug — so the cases
 * that matter are the ones where "plain" would actually read as broken.
 */
describe('docBodyToHtml', () => {
  it('leaves HTML alone', () => {
    expect(docBodyToHtml('<h2>Why</h2><p>Because</p>')).toBe('<h2>Why</h2><p>Because</p>');
  });

  it('renders Markdown headings, lists and emphasis', () => {
    expect(docBodyToHtml('## Shape\n\n- One-click **OAuth**\n- Nightly sync')).toBe(
      '<h2>Shape</h2><ul><li>One-click <b>OAuth</b></li><li>Nightly sync</li></ul>',
    );
  });

  it('turns a ```mermaid fence into a diagram, not a listing', () => {
    const html = docBodyToHtml('```mermaid\nflowchart LR\n  A --> B\n```');
    expect(html).toContain('class="mermaid-block"');
    expect(html).toContain('flowchart LR');
  });

  describe('tables', () => {
    it('renders a Markdown table as a real table', () => {
      expect(docBodyToHtml('| Step | Owner |\n| --- | --- |\n| Fetch | worker |')).toBe(
        '<table><thead><tr><th>Step</th><th>Owner</th></tr></thead>' +
          '<tbody><tr><td>Fetch</td><td>worker</td></tr></tbody></table>',
      );
    });

    it('accepts alignment markers and a header-only table', () => {
      expect(docBodyToHtml('| A | B |\n| :-- | --: |')).toBe(
        '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody></tbody></table>',
      );
    });

    it('keeps an escaped pipe inside a cell', () => {
      expect(docBodyToHtml('| Sym |\n| --- |\n| a \\| b |')).toContain('<td>a | b</td>');
    });

    // Without the divider it is prose that happens to contain pipes — treating
    // it as a table would eat sentences whole.
    it('is not fooled by a sentence containing pipes', () => {
      expect(docBodyToHtml('Run | grep | wc, then stop.')).toBe(
        '<p>Run | grep | wc, then stop.</p>',
      );
    });

    it('ends the paragraph above it', () => {
      expect(docBodyToHtml('Steps below.\n| A |\n| --- |\n| x |')).toBe(
        '<p>Steps below.</p><table><thead><tr><th>A</th></tr></thead>' +
          '<tbody><tr><td>x</td></tr></tbody></table>',
      );
    });
  });
});

describe('stripEchoedTitle', () => {
  it('drops an opening heading that only repeats the title', () => {
    expect(stripEchoedTitle('<h1>Sync design</h1><p>Body</p>', 'Sync design')).toBe('<p>Body</p>');
  });

  it('keeps a heading of the page’s own', () => {
    const html = '<h2>How it runs</h2><p>Body</p>';
    expect(stripEchoedTitle(html, 'Sync design')).toBe(html);
  });
});
