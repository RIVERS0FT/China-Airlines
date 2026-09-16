import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Transient maintenance helper; never shipped on main.
const script = 'scripts/retired-save-cleanup.once.mjs';
let text = fs.readFileSync(script, 'utf8');
const incorrect = 'if (node.importClause) for (const name of identifiers(node.importClause)) names.add(name);';
assert(text.includes(incorrect));
text = text.replace(incorrect, `const clause = node.importClause;
    if (clause?.name) names.add(clause.name.text);
    if (clause?.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) names.add(clause.namedBindings.name.text);
      else for (const element of clause.namedBindings.elements) names.add(element.name.text);
    }`);
fs.writeFileSync(script, text);

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const changed = [];
for (const file of walk('e2e').filter(file => file.endsWith('.ts'))) {
  let content = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const edits = [];
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const match = node.moduleSpecifier.text.match(/(?:^|\/)fixtures\/v([1-6])-.*\.json$/);
    if (!match) continue;
    assert(node.importClause?.name && !node.importClause.namedBindings, 'Review non-default historical import');
    edits.push({ start: node.getStart(source), end: node.end, replacement: `const ${node.importClause.name.text} = retiredSave(${match[1]});` });
  }
  if (!edits.length) continue;
  for (const edit of edits.sort((a, b) => b.start - a.start)) content = content.slice(0, edit.start) + edit.replacement + content.slice(edit.end);
  let helper = path.relative(path.dirname(file), 'e2e/retired-save-helpers.js').replaceAll(path.sep, '/');
  if (!helper.startsWith('.')) helper = './' + helper;
  content = `import { retiredSave } from '${helper}';\n` + content;
  content = content.replaceAll('flight is rejected', 'save version is rejected');
  fs.writeFileSync(file, content); changed.push(file);
}
assert(changed.length > 0, 'Expected browser save rejection coverage to retain');
const helper = 'e2e/retired-save-helpers.ts';
const original = fs.readFileSync(helper, 'utf8');
assert(!original.includes('function retiredSave'));
fs.writeFileSync(helper, "import { GameCore } from '../src/core/game.js';\n" + original + `
/** Synthetic version-gate input, not an archived or player-owned save. */
export function retiredSave(version: 1 | 2 | 3 | 4 | 5 | 6) {
  return { ...new GameCore(1_800_000_000_000).snapshot(), version };
}
`);
console.log('Browser tests retained with generated version-gate inputs:', changed);
