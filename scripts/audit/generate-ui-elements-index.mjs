import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'apps/web/src';
const OUTPUT_DIR = 'docs/audit';
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'ui-elements-index.json');
const OUTPUT_MD = path.join(OUTPUT_DIR, 'ui-elements-index.md');

const INTERACTIVE_NATIVE = ['button', 'input', 'select', 'textarea'];
const STRUCTURAL_NATIVE = [
  'main',
  'header',
  'footer',
  'section',
  'article',
  'aside',
  'nav',
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'ul',
  'ol',
  'li',
  'img',
  'a',
];

function listTsxFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsxFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith('.tsx')) out.push(fullPath);
  }
  return out.sort();
}

function countTags(source, tagName) {
  const re = new RegExp(`<${tagName}(\\s|>)`, 'g');
  return (source.match(re) ?? []).length;
}

function detectLayer(file) {
  if (file.includes('/design-system/')) return 'design-system';
  if (file.includes('/pages/admin/')) return 'admin-page';
  if (file.includes('/pages/')) return 'page-route';
  if (file.includes('/features/')) return 'feature';
  return 'other';
}

function hasTailwindUtilityClass(source) {
  // Deliberately narrow detection to avoid false positives like "main-layout__main".
  return /className="[^"]*\b(?:p|m[trblxy]?|text|bg|rounded|flex|grid|space-[xy])-[^\s"]+/g.test(
    source,
  );
}

function classify(file, source) {
  const layer = detectLayer(file);
  const nativeCounts = {};
  for (const tag of [...INTERACTIVE_NATIVE, ...STRUCTURAL_NATIVE]) {
    const count = countTags(source, tag);
    if (count > 0) nativeCounts[tag] = count;
  }

  const nativeInteractiveCount = INTERACTIVE_NATIVE.reduce(
    (acc, tag) => acc + (nativeCounts[tag] ?? 0),
    0,
  );
  const tableHeavy = (nativeCounts.table ?? 0) > 0;
  const tailwind = hasTailwindUtilityClass(source);

  let status = 'ok';
  const reasons = [];

  if (layer === 'design-system') {
    status = 'canonical';
  } else {
    if (tailwind) {
      status = 'flag';
      reasons.push('utility-class styling present');
    }
    if (nativeInteractiveCount > 0) {
      status = 'flag';
      reasons.push('native interactive controls outside DS');
    }
    if (tableHeavy) {
      reasons.push('native table rendering (often intentional for dense score grids)');
      if (status !== 'flag') status = 'review';
    }
  }

  const formPattern =
    layer === 'design-system'
      ? 'DS primitive'
      : nativeInteractiveCount > 0
        ? 'Native interactive composite'
        : tableHeavy
          ? 'Table-heavy display composite'
          : 'DS composition';

  return {
    file,
    layer,
    functionPattern: layer,
    formPattern,
    status,
    reasons,
    nativeCounts,
    nativeInteractiveCount,
    tableHeavy,
    hasTailwindUtilityClass: tailwind,
  };
}

function toMarkdown(rows) {
  const canonical = rows.filter((r) => r.status === 'canonical').length;
  const flags = rows.filter((r) => r.status === 'flag');
  const review = rows.filter((r) => r.status === 'review');

  const lines = [];
  lines.push('## UI Element Index');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`- Files scanned: ${rows.length}`);
  lines.push(`- Canonical (DS primitives): ${canonical}`);
  lines.push(`- Flagged for refinement: ${flags.length}`);
  lines.push(`- Review-only (intentional/verify): ${review.length}`);
  lines.push('');
  lines.push('### Flagged (Action Required)');
  lines.push('');
  if (flags.length === 0) {
    lines.push('None');
    lines.push('');
  } else {
    for (const row of flags) {
      lines.push(`- \`${row.file}\``);
      lines.push(`  - Function: ${row.functionPattern}`);
      lines.push(`  - Form: ${row.formPattern}`);
      lines.push(`  - Reasons: ${row.reasons.join('; ')}`);
    }
    lines.push('');
  }

  lines.push('### Review (Likely Intentional, Confirm)');
  lines.push('');
  if (review.length === 0) {
    lines.push('None');
  } else {
    for (const row of review) {
      lines.push(`- \`${row.file}\` — ${row.reasons.join('; ')}`);
    }
  }
  lines.push('');
  lines.push('### Full Index');
  lines.push('');
  lines.push('| File | Function | Form | Status |');
  lines.push('|---|---|---|---|');
  for (const row of rows) {
    lines.push(`| \`${row.file}\` | ${row.functionPattern} | ${row.formPattern} | ${row.status} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const files = listTsxFiles(ROOT);
  const rows = files.map((file) => classify(file, fs.readFileSync(file, 'utf8')));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(rows, null, 2)}\n`);
  fs.writeFileSync(OUTPUT_MD, toMarkdown(rows));
  process.stdout.write(`Wrote ${OUTPUT_JSON} and ${OUTPUT_MD} (${rows.length} files)\n`);
}

main();
