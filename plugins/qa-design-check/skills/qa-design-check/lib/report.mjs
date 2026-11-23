import { VERSION, configHash, config, SEVERITIES } from './config.mjs';

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const fmt = (v) => (typeof v === 'number' ? `${v}px` : String(v ?? '-'));

function label(f) {
    const text = f.figmaText ? `"${f.figmaText.slice(0, 22)}"` : `"${(f.figmaName || f.testId || '').slice(0, 22)}"`;
    return text;
}

const byKind = (list, ...kinds) => list.filter((f) => kinds.includes(f.kind));

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const MAIN_KINDS = ['color', 'font', 'spacing', 'size'];

const severityLine = (counts) =>
    SEVERITIES.map((s) => `${counts[s] || 0} ${s}`).join(' · ');

export function renderTerminal(r) {
    const L = [];
    L.push(`Frame: "${r.frame.name}"   ${Math.round(r.frame.width)}×${Math.round(r.frame.height)}${r.label ? `   [${r.label}]` : ''}`);
    L.push(`  file ${r.fileKey}  node ${r.nodeId}  source ${r.source}`);
    L.push(`  mock version ${r.figmaVersion}   modified ${r.lastModified ?? '-'}`);
    const vpNote = r.viewport !== r.viewportRequested ? `  ⚠ requested ${r.viewportRequested}` : '';
    L.push(`Page: ${r.pageUrl}   viewport ${r.viewport}${vpNote}`);
    L.push(`Tool ${VERSION}   tolerance config ${configHash}`);
    L.push('');

    L.push('Coverage');
    const total = r.counts.hidden == null ? r.counts.visible : r.counts.visible + r.counts.hidden;
    L.push(
        r.counts.hidden == null
            ? `  mock has ${total} nodes (MCP returns only the visible tree)`
            : `  mock has ${total} nodes → ${r.counts.hidden} hidden dropped → ${r.counts.visible} visible`,
    );
    L.push(`  of them ${r.counts.comparable} worth comparing, ${r.counts.wrappers} layout wrappers skipped`);
    L.push(`  mock → site: matched ${r.matched} / ${r.counts.comparable}      not found on the page ${r.unmatchedCount}`);
    L.push(`  site → mock: ${plural(r.reverse.total, 'element', 'elements')} on the page with no counterpart in the mock`);
    L.push(`  consistency: compared ${plural(r.consistencyGroups.length, 'group', 'groups')} of repeated elements`);
    if (r.consistencyGroups.length) {
        L.push(`    ${r.consistencyGroups.slice(0, 6).map((g) => `${g.name}×${g.size}`).join(' · ')}`);
    }
    L.push(`Anchors: ${r.anchorCount} (${r.secondPassCount} of them from the second pass) out of ${r.figmaTextCount} unique mock texts`);
    if (r.anchorTexts.length) L.push(`  ${r.anchorTexts.slice(0, 8).join(' · ')}`);
    L.push('');

    L.push(`VERDICT ${r.verdict}   ${severityLine(r.severityCounts)}`);
    L.push('');

    if (r.systemic.length) {
        L.push(`SYSTEMIC (${r.systemic.length}): one cause across many elements`);
        for (const f of r.systemic) {
            const name = f.token ? f.token : f.prop;
            L.push(`  ${pad(name, 28)} mock ${pad(fmt(f.expected), 12)} site ${pad(fmt(f.actual), 12)} on ${f.count} elements`);
        }
        L.push('');
    }

    const main = byKind(r.individual, ...MAIN_KINDS);
    L.push(`DIFFERENCES (${main.length})`);
    if (!main.length) {
        L.push('  none');
    } else {
        L.push('');
        L.push(`${pad('severity', 10)}${pad('Figma layer', 24)}${pad('property', 22)}${pad('Figma', 12)}${pad('site', 12)}${pad('delta', 8)}shot`);
        L.push('─'.repeat(104));
        for (const f of main) {
            L.push(
                pad(f.severity, 10) +
                    pad(label(f), 24) +
                    pad(f.prop, 22) +
                    pad(fmt(f.expected), 12) +
                    pad(fmt(f.actual), 12) +
                    pad(f.delta != null ? (f.delta > 0 ? `+${f.delta}` : f.delta) : '-', 8) +
                    (f.shot ? '📎' : ''),
            );
            if (f.consequence) L.push(`${' '.repeat(10)}⚠ ${f.consequence}`);
            if (f.styleName) L.push(`${' '.repeat(10)}style ${f.styleName}`);
            if (f.token) L.push(`${' '.repeat(10)}token on the site ${f.token}`);
            const note = evidenceNote(f);
            if (note) L.push(`${' '.repeat(10)}${note}`);
        }
    }

    const inconsistent = byKind(r.individual, 'consistency');
    if (inconsistent.length) {
        L.push('');
        L.push(`INCONSISTENCY (${inconsistent.length}): repeated elements disagree with each other`);
        for (const f of inconsistent) {
            L.push(
                f.ambiguous
                    ? `  ${pad(label(f), 24)} ${pad(f.prop, 20)} ${f.expected}   (${f.group.size} elements, no majority: a question for the designer)`
                    : `  ${pad(label(f), 24)} ${pad(f.prop, 20)} ${f.group.agreeing}/${f.group.size} have ${fmt(f.expected)}, deviating ${fmt(f.actual)}`,
            );
            for (const d of f.deviants.slice(0, 3)) L.push(`${' '.repeat(4)}${d.selector}`);
        }
    }

    const texts = byKind(r.individual, 'text');
    if (texts.length) {
        L.push('');
        L.push(`TEXT DIFFERS FROM THE MOCK (${texts.length}): Figma is not the source of copy, check the ticket or the translation source`);
        for (const f of texts) L.push(`  mock "${f.expected}"   site "${f.actual}"`);
    }

    const missing = byKind(r.individual, 'missing');
    if (missing.length) {
        L.push('');
        L.push(`IN THE MOCK, NOT ON THE PAGE (${missing.length}): may not be implemented yet`);
        for (const f of missing.slice(0, 20)) L.push(`  ${pad(label(f), 30)} ${f.reason ?? ''}`);
        if (missing.length > 20) L.push(`  ... ${missing.length - 20} more`);
    }

    const extra = byKind(r.individual, 'extra');
    if (extra.length) {
        L.push('');
        L.push(`ON THE PAGE, NOT IN THE MOCK (${extra.length}): extra, leaked from another state, or the mock is behind`);
        for (const f of extra) L.push(`  ${pad(f.actual, 44)} ${f.selector}`);
        if (r.reverse.total > extra.length) L.push(`  ... ${r.reverse.total - extra.length} more over the limit`);
    }

    if (r.shots.drawn) {
        L.push('');
        L.push(`SCREENSHOTS (${r.shots.drawn})`);
        for (const f of r.individual.filter((x) => x.shot)) {
            L.push(`  ${f.shot}`);
            L.push(`    In the mock: ${f.caption.design}`);
            L.push(`    Live:        ${f.caption.live}`);
            L.push(`    Look at:     ${f.caption.lookAt}`);
        }
        if (r.shots.capped) L.push(`  limit ${config.maxScreenshots}: ${r.shots.capped} more findings without a picture, numbers kept`);
    }
    for (const note of r.shots.skipped) L.push(`  ⚠ ${note}`);

    L.push('');
    L.push('COMPLETION CHECK');
    for (const [k, v] of Object.entries(r.completion)) L.push(`  ${pad(k, 42)} ${v}`);

    if (r.acceptedCount) {
        L.push('');
        L.push(`accepted deviations: ${r.acceptedCount}`);
    }
    if (r.droppedByFloor) {
        L.push(`dropped by the ${config.geometryFloor}px floor: ${r.droppedByFloor}`);
    }

    if (r.skipped.length) {
        L.push('');
        L.push(`SKIPPED (${r.skipped.length}), and why`);
        for (const s of r.skipped.slice(0, 15)) L.push(`  "${(s.figmaName || '').slice(0, 30)}"  ${s.reason}`);
        if (r.skipped.length > 15) L.push(`  ... ${r.skipped.length - 15} more`);
    }

    const withSel = main.filter((f) => f.selector).slice(0, 12);
    if (withSel.length) {
        L.push('');
        L.push('Selectors for the developer:');
        for (const f of withSel) L.push(`  ${pad(label(f), 26)} → ${f.selector}`);
    }

    return L.join('\n');
}

/**
 * Property families the mock actually declares. A family nothing declares was not
 * compared, however many tolerances the config lists, this is the line that makes an
 * MCP spec carrying no fills visible instead of silently unchecked.
 */
export function specCoverage(items) {
    const families = {
        geometry: (i) => i.box,
        typography: (i) => i.font?.size != null,
        'font family': (i) => i.font?.family,
        fill: (i) => i.fill,
        'text colour': (i) => i.textColor,
        stroke: (i) => i.strokeWeight != null || i.stroke,
        radius: (i) => i.radius,
        padding: (i) => i.padding,
        gap: (i) => i.gap != null,
    };
    return Object.fromEntries(Object.entries(families).map(([name, has]) => [name, items.filter(has).length]));
}

/**
 * The completion block the QA flow requires, filled from what the engine measured
 * rather than from what the model believes it did. Every line is a count that either
 * adds up or does not: a self-attested checklist is worth nothing, and a line hard-coded
 * to "yes" is a self-attested checklist wearing a number's clothes.
 */
export function completionCheck(r) {
    const declared = Object.entries(r.specCoverage).filter(([, n]) => n > 0);
    const absent = Object.entries(r.specCoverage).filter(([, n]) => n === 0);

    const check = {
        'Mock source': r.source === 'mcp' ? 'MCP / Dev Seat' : 'PAT / REST API',
        'Design scope collected': `yes, ${r.counts.comparable} nodes worth comparing`,
        'Figma nodes examined': `${r.frame.name} (node ${r.nodeId})`,
        'Mock → site': r.matched === r.counts.comparable ? 'complete' : `${r.matched}/${r.counts.comparable}`,
        'Site → mock (reverse)': `examined ${r.reverse.examined} unpaired → ${r.reverse.total} substantial`,
        'State / theme of this run': r.label || 'not set (one state from the link)',
        'Properties the mock declares': declared.map(([n, c]) => `${n} ${c}`).join(', ') || 'none',
        'Properties with no data in the mock': absent.length ? absent.map(([n]) => n).join(', ') : 'none',
        'Extra elements': `${r.reverse.total} found`,
        'Missing elements': `${r.unmatchedCount} of ${r.counts.comparable} mock nodes not found`,
        'Consistency checked': r.consistencyGroups.length
            ? `${plural(r.consistencyGroups.length, 'group', 'groups')}: ${r.consistencyGroups.slice(0, 8).map((g) => `${g.name}×${g.size}`).join(', ')}`
            : 'no groups of repeated elements in the mock',
        'Screenshot evidence': screenshotGate(r),
    };
    if (r.anchorCount < config.minAnchors + 2) {
        check['⚠ Alignment reliability'] = `only ${r.anchorCount} anchors, the result is thin`;
    }
    return check;
}

/**
 * The evidence gate, and it must be able to fail. A finding that could be shown and is
 * not is the one case where this line has to say so out loud instead of quietly
 * reporting how many pictures got drawn.
 */
function screenshotGate(r) {
    const owed = r.individual.filter((f) => f.worthDrawing && !f.shot);
    const parts = [`${r.shots.drawn} findings with a picture`];
    if (r.shots.capped) parts.push(`${r.shots.capped} over the limit of ${config.maxScreenshots}, numbers kept`);
    if (owed.length) parts.push(`⚠ ${owed.length} worth a picture but without one`);
    if (!r.shots.drawn && !owed.length) return 'not applicable: no findings that can be shown';
    return parts.join('; ');
}

/** The QA flow requires either evidence or a stated reason for its absence, per finding. */
export function evidenceNote(f) {
    if (f.shot) return null;
    if (!f.selector) return 'Screenshot evidence: not applicable, the element is not on the page';
    if (!f.worthDrawing) return 'Screenshot evidence: not applicable, a non-numeric difference fully described by its values';
    return 'Screenshot evidence: not applicable, over the per-run screenshot limit';
}

export function renderJira(r) {
    const L = [];
    L.push(`h3. Design check: ${r.frame.name}${r.label ? ` / ${r.label}` : ''}`);
    L.push('');
    L.push(`*Verdict:* ${r.verdict} ${severityLine(r.severityCounts)}`);
    L.push(`*Mock:* [${r.frame.name}|https://www.figma.com/design/${r.fileKey}?node-id=${r.nodeId.replace(':', '-')}]`);
    L.push(`*Mock version:* ${r.figmaVersion} (modified ${r.lastModified ?? '-'}), source ${r.source}`);
    L.push(`*Page:* ${r.pageUrl} (viewport ${r.viewport})`);
    L.push('');

    if (r.systemic.length) {
        L.push('h4. Systemic');
        for (const f of r.systemic) L.push(`* {{${f.token || f.prop}}}: mock {{${fmt(f.expected)}}}, site {{${fmt(f.actual)}}} on ${f.count} elements`);
        L.push('');
    }

    const main = byKind(r.individual, ...MAIN_KINDS);
    if (main.length) {
        L.push('h4. Differences');
        L.push('||Severity||Element||Property||Mock||Site||Selector||Shot||');
        for (const f of main) {
            L.push(`|${f.severity}|${label(f)}|${f.prop}|${fmt(f.expected)}|${fmt(f.actual)}|{{${f.selector || '-'}}}|${f.shot || '-'}|`);
        }
        L.push('');
    }

    const inconsistent = byKind(r.individual, 'consistency');
    if (inconsistent.length) {
        L.push('h4. Inconsistent repeated elements');
        for (const f of inconsistent) {
            L.push(
                f.ambiguous
                    ? `* ${label(f)}: {{${f.prop}}}: ${f.expected} (${f.group.size} elements, no majority)`
                    : `* ${label(f)}: {{${f.prop}}}: ${f.group.agreeing}/${f.group.size} have {{${fmt(f.expected)}}}, deviating {{${f.actual}}}`,
            );
        }
        L.push('');
    }

    const texts = byKind(r.individual, 'text');
    if (texts.length) {
        L.push('h4. Text differs from the mock');
        L.push('Figma is not the source of truth for copy: check against the ticket or the translation source.');
        for (const f of texts) L.push(`* mock {{${f.expected}}} / site {{${f.actual}}}`);
        L.push('');
    }

    const extra = byKind(r.individual, 'extra');
    if (extra.length) {
        L.push(`h4. On the page, not in the mock (${extra.length})`);
        for (const f of extra) L.push(`* ${f.actual}: {{${f.selector}}}`);
        L.push('');
    }

    const missing = byKind(r.individual, 'missing');
    if (missing.length) {
        L.push(`h4. In the mock, not on the page (${missing.length})`);
        L.push('Needs confirmation: may not be implemented yet.');
        for (const f of missing) L.push(`* ${label(f)}`);
    }

    return L.join('\n');
}

export function renderHtml(r) {
    const shot = (f) =>
        f.shot
            ? `<div class="shot"><img src="${esc(f.shot)}" alt="${esc(f.prop)}">
        <div class="cap"><b>In the mock:</b> ${esc(f.caption.design)}<br><b>Live:</b> ${esc(f.caption.live)}<br><b>Look at:</b> ${esc(f.caption.lookAt)}</div></div>`
            : '';

    const rows = [...r.systemic.map((f) => ({ ...f, systemic: true })), ...r.individual]
        .map(
            (f) => `<tr class="${f.kind} sev-${f.severity}">
      <td>${f.systemic ? '<b>systemic</b>' : esc(f.severity)}${f.consequence ? `<br><small>⚠ ${esc(f.consequence)}</small>` : ''}</td>
      <td>${esc(label(f))}${f.styleName ? `<br><small>${esc(f.styleName)}</small>` : ''}</td>
      <td>${esc(f.prop)}${f.token ? `<br><small>${esc(f.token)}</small>` : ''}</td>
      <td class="v">${esc(fmt(f.expected))}</td>
      <td class="v">${esc(fmt(f.actual))}</td>
      <td>${f.count ? `on ${f.count} elements` : esc(f.selector || '-')}${shot(f)}</td>
    </tr>`,
        )
        .join('\n');

    const completion = Object.entries(r.completion)
        .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
        .join('\n');

    return `<!doctype html><meta charset="utf-8"><title>qa-design-check: ${esc(r.frame.name)}</title>
<style>
:root{--bg:#fff;--fg:#111;--mut:#666;--line:#e3e3e3;--head:#f6f6f6}
@media(prefers-color-scheme:dark){:root{--bg:#16181d;--fg:#e8e8e8;--mut:#9aa0a6;--line:#2c2f36;--head:#1e2128}}
body{margin:0;padding:24px;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
h1{font-size:18px;margin:0 0 4px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin:28px 0 8px}
.meta{color:var(--mut);font-size:12px;margin-bottom:20px}
.verdict{font-size:16px;font-weight:600;margin-bottom:20px}
.shots{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.shots figure{margin:0}.shots img{max-width:100%;border:1px solid var(--line);border-radius:8px}
figcaption{font-size:12px;color:var(--mut);margin-bottom:6px}
.wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:720px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--head);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td.v{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
small{color:var(--mut)}
.shot{margin-top:8px}.shot img{max-width:520px;width:100%;border:1px solid var(--line);border-radius:6px}
.cap{font-size:12px;color:var(--mut);margin-top:4px}
tr.sev-Critical td:first-child{color:#c0392b;font-weight:700}
tr.sev-Major td:first-child{color:#d35400;font-weight:600}
tr.missing td:first-child,tr.extra td:first-child{color:#7d3c98}
</style>
<h1>${esc(r.frame.name)}${r.label ? ` / ${esc(r.label)}` : ''}</h1>
<div class="verdict">${r.verdict} ${esc(severityLine(r.severityCounts))}</div>
<div class="meta">
  ${esc(r.pageUrl)} · viewport ${r.viewport} · mock ${Math.round(r.frame.width)}×${Math.round(r.frame.height)}<br>
  mock version ${esc(r.figmaVersion)} (modified ${esc(r.lastModified ?? '-')}) · source ${esc(r.source)} · tool ${VERSION} · config ${configHash}<br>
  mock → site ${r.matched}/${r.counts.comparable} · site → mock ${r.reverse.total} unpaired · anchors ${r.anchorCount} · consistency groups ${r.consistencyGroups.length}
</div>
<div class="shots">
  <figure><figcaption>Mock</figcaption>${r.figmaImage ? `<img src="${esc(r.figmaImage)}" alt="mock">` : '<small>image not available</small>'}</figure>
  <figure><figcaption>Site</figcaption>${r.pageImage ? `<img src="${esc(r.pageImage)}" alt="site">` : '<small>no screenshot taken</small>'}</figure>
</div>
<div class="wrap"><table>
<tr><th>severity</th><th>Figma layer</th><th>property</th><th>Figma</th><th>site</th><th>where on the site</th></tr>
${rows || '<tr><td colspan="6">No differences</td></tr>'}
</table></div>
<h2>Completion check</h2>
<div class="wrap"><table>${completion}</table></div>`;
}

const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
