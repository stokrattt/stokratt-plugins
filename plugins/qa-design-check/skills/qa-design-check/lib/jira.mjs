import { SEVERITIES } from './config.mjs';
import { evidenceNote } from './report.mjs';

const text = (value, marks) => ({ type: 'text', text: String(value ?? '-'), ...(marks ? { marks } : {}) });
const code = (value) => text(value, [{ type: 'code' }]);
const strong = (value) => text(value, [{ type: 'strong' }]);
const para = (...content) => ({ type: 'paragraph', content: content.filter(Boolean) });
const item = (...content) => ({ type: 'listItem', content: [para(...content)] });
const bullets = (items) => (items.length ? { type: 'bulletList', content: items } : null);

/**
 * `expand` collapses the block in the Jira UI. Several audits land on one issue, so a
 * comment that cannot be folded is a comment that buries the task: three visible lines,
 * everything else one click away.
 */
const expand = (title, content) =>
    content.filter(Boolean).length ? { type: 'expand', attrs: { title }, content: content.filter(Boolean) } : null;

const fmt = (v) => (typeof v === 'number' ? `${v}px` : String(v ?? '-'));
const name = (f) => f.figmaText || f.figmaName || f.testId || 'element';
const byKind = (list, ...kinds) => list.filter((f) => kinds.includes(f.kind));

function findingItem(f) {
    const head = [
        strong(`[${f.severity}] `),
        text(`${name(f)}: ${f.prop}: mock `),
        code(fmt(f.expected)),
        text(', site '),
        code(fmt(f.actual)),
    ];
    if (f.consequence) head.push(text(` ⚠ ${f.consequence}`));
    const body = [para(...head), f.selector ? para(code(f.selector)) : null];

    // No media node: the Atlassian MCP has no attachment endpoint, so the picture stays
    // a local file and the comment carries its path plus the caption that makes it
    // readable without opening it.
    if (f.shot) {
        body.push(para(strong('Shot: '), code(f.shot)));
        body.push(para(strong('In the mock: '), text(f.caption.design)));
        body.push(para(strong('Live: '), text(f.caption.live)));
        body.push(para(strong('Look at: '), text(f.caption.lookAt)));
    } else {
        const note = evidenceNote(f);
        if (note) body.push(para(text(note)));
    }
    return { type: 'listItem', content: body };
}

/**
 * Builds the ADF document for the Jira comment. It is written to disk, not posted:
 * the tester approves the draft first, and the posting itself goes through the
 * Atlassian MCP with `contentFormat: "adf"`.
 */
export function buildAdf(r) {
    const counts = SEVERITIES.map((s) => `${r.severityCounts[s] || 0} ${s}`).join(' · ');
    const main = byKind(r.individual, 'color', 'font', 'spacing', 'size');
    const inconsistent = byKind(r.individual, 'consistency');
    const texts = byKind(r.individual, 'text');
    const extra = byKind(r.individual, 'extra');
    const missing = byKind(r.individual, 'missing');

    const content = [
        para(strong(`${r.verdict} Design check, Claude Code | ${new Date().toISOString().slice(0, 10)}`)),
        para(
            text(`${r.frame.name}${r.label ? ` / ${r.label}` : ''} · `),
            code(r.pageUrl),
            text(` · viewport ${r.viewport} · source ${r.source === 'mcp' ? 'Figma MCP' : 'Figma REST'}`),
        ),
        para(strong('VERDICT: '), text(counts)),

        expand(`Systemic: ${r.systemic.length}`, [
            bullets(
                r.systemic.map((f) =>
                    item(
                        code(f.token || f.prop),
                        text(`: mock `),
                        code(fmt(f.expected)),
                        text(', site '),
                        code(fmt(f.actual)),
                        text(` on ${f.count} elements`),
                    ),
                ),
            ),
        ]),

        expand(`Differences: ${main.length}`, [bullets(main.map(findingItem))]),

        expand(`Inconsistent repeated elements: ${inconsistent.length}`, [
            bullets(
                inconsistent.map((f) =>
                    f.ambiguous
                        ? item(text(`${name(f)}: `), code(f.prop), text(`: ${f.expected} (${f.group.size} elements, no majority)`))
                        : item(
                              text(`${name(f)}: `),
                              code(f.prop),
                              text(`: ${f.group.agreeing}/${f.group.size} have `),
                              code(fmt(f.expected)),
                              text(', deviating '),
                              code(fmt(f.actual)),
                          ),
                ),
            ),
        ]),

        expand(`Text differs from the mock: ${texts.length}`, [
            texts.length ? para(text('Figma is not the source of truth for copy: check against the ticket or the translation source.')) : null,
            bullets(texts.map((f) => item(text('mock '), code(f.expected), text(' / site '), code(f.actual)))),
        ]),

        expand(`On the page, not in the mock: ${extra.length}`, [
            bullets(extra.map((f) => item(text(`${f.actual}: `), code(f.selector)))),
        ]),

        expand(`In the mock, not on the page: ${missing.length}`, [
            missing.length ? para(text('Needs confirmation: may not be implemented yet.')) : null,
            bullets(missing.map((f) => item(text(name(f))))),
        ]),

        expand('Completion check', [
            bullets(Object.entries(r.completion).map(([k, v]) => item(strong(`${k}: `), text(v)))),
        ]),
    ];

    return { type: 'doc', version: 1, content: content.filter(Boolean) };
}
