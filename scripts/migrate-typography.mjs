#!/usr/bin/env node
// One-shot migration: inline pixel fontSize/fontFamily → var(--fs-*)/var(--ff-*).
// Run from repo root:  node scripts/migrate-typography.mjs

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

// All inline (fontFamily, fontSize) pairs we want to map.
// Order matters only for readability; each is processed independently.
const REPLACEMENTS = [
  // ── Press Start 2P → mostly section (8px desktop / 8px mobile) ──
  ['Press Start 2P', '5px',  'var(--ff-section)', 'var(--fs-section)'],
  ['Press Start 2P', '6px',  'var(--ff-section)', 'var(--fs-section)'],
  ['Press Start 2P', '7px',  'var(--ff-section)', 'var(--fs-section)'],
  ['Press Start 2P', '8px',  'var(--ff-section)', 'var(--fs-section)'],
  ['Press Start 2P', '9px',  'var(--ff-title)',   'var(--fs-title)'],
  ['Press Start 2P', '10px', 'var(--ff-title)',   'var(--fs-title)'],

  // ── Share Tech Mono ──
  ['Share Tech Mono', '8px',  'var(--ff-body)', 'var(--fs-body-sm)'],
  ['Share Tech Mono', '9px',  'var(--ff-body)', 'var(--fs-body-sm)'],
  ['Share Tech Mono', '10px', 'var(--ff-body)', 'var(--fs-body-sm)'],
  ['Share Tech Mono', '11px', 'var(--ff-body)', 'var(--fs-body)'],
  ['Share Tech Mono', '12px', 'var(--ff-body)', 'var(--fs-body)'],
  ['Share Tech Mono', '13px', 'var(--ff-input)', 'var(--fs-input)'],
  ['Share Tech Mono', '14px', 'var(--ff-input)', 'var(--fs-input)'],

  // ── VT323 display numbers ──
  ['VT323', '18px', 'var(--ff-display)', 'var(--fs-disp-sm)'],
  ['VT323', '20px', 'var(--ff-display)', 'var(--fs-disp-sm)'],
  ['VT323', '22px', 'var(--ff-display)', 'var(--fs-disp-sm)'],
  ['VT323', '24px', 'var(--ff-display)', 'var(--fs-disp-sm)'],
  ['VT323', '26px', 'var(--ff-display)', 'var(--fs-disp-sm)'],
  ['VT323', '28px', 'var(--ff-display)', 'var(--fs-disp-md)'],
  ['VT323', '30px', 'var(--ff-display)', 'var(--fs-disp-md)'],
  ['VT323', '32px', 'var(--ff-display)', 'var(--fs-disp-md)'],
  ['VT323', '34px', 'var(--ff-display)', 'var(--fs-disp-md)'],
  ['VT323', '36px', 'var(--ff-display)', 'var(--fs-disp-md)'],
  ['VT323', '38px', 'var(--ff-display)', 'var(--fs-disp-lg)'],
  ['VT323', '40px', 'var(--ff-display)', 'var(--fs-disp-lg)'],
  ['VT323', '42px', 'var(--ff-display)', 'var(--fs-disp-lg)'],
];

// Build search/replace strings matching the project's exact inline style format.
const PATTERNS = REPLACEMENTS.flatMap(([font, size, ff, fs]) => {
  const old1 = `fontFamily: "'${font}'", fontSize: '${size}'`;
  const new1 = `fontFamily: ${ff.startsWith('var(') ? `'${ff}'` : `"${ff}"`}, fontSize: '${fs}'`;
  // Some files put fontSize first, fontFamily second
  const old2 = `fontSize: '${size}', fontFamily: "'${font}'"`;
  const new2 = `fontSize: '${fs}', fontFamily: '${ff}'`;
  return [
    [old1, new1],
    [old2, new2],
  ];
});

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node migrate-typography.mjs <file1.tsx> [<file2.tsx> ...]');
  process.exit(1);
}

let totalReplacements = 0;
const fileStats = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`Skip ${file}: ${err.message}`);
    continue;
  }
  let fileReplacements = 0;
  for (const [oldStr, newStr] of PATTERNS) {
    while (content.includes(oldStr)) {
      content = content.replace(oldStr, newStr);
      fileReplacements++;
    }
  }
  if (fileReplacements > 0) {
    writeFileSync(file, content);
    totalReplacements += fileReplacements;
    fileStats.push({ file, count: fileReplacements });
  }
}

console.log(`\n${totalReplacements} replacements across ${fileStats.length} files:\n`);
for (const { file, count } of fileStats) {
  console.log(`  ${path.relative(process.cwd(), file).padEnd(60)} ${count}`);
}
