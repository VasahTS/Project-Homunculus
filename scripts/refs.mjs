#!/usr/bin/env node
// Reference repos (SillyTavern, Homunculus v1, Marinara, Aventuras): fetch them at the pinned
// commits and regenerate docs/reference/symbols/*.txt. See docs/reference/README.md.
//
//   node scripts/refs.mjs            fetch pinned commits into .refs/ and rebuild the symbol files
//   node scripts/refs.mjs --latest   move every repo to the tip of its branch and update the pins
//   node scripts/refs.mjs --check    only verify that the paths cited in docs/reference/*.md exist
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const refsDir = join(root, '.refs');
const docDir = join(root, 'docs', 'reference');
const pinsFile = join(docDir, 'pins.json');
const pins = JSON.parse(readFileSync(pinsFile, 'utf8'));
const args = new Set(process.argv.slice(2));

const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function fetchRepo(name, repo) {
    const dir = join(refsDir, name);
    if (!existsSync(join(dir, '.git'))) {
        mkdirSync(dir, { recursive: true });
        git(dir, 'init', '-q');
        git(dir, 'remote', 'add', 'origin', repo.url);
    }
    const target = args.has('--latest') ? repo.branch : repo.commit;
    git(dir, 'fetch', '-q', '--depth', '1', 'origin', target);
    git(dir, 'checkout', '-q', '--force', 'FETCH_HEAD');
    repo.commit = git(dir, 'rev-parse', 'HEAD');
    repo.date = git(dir, 'log', '-1', '--format=%cs');
    return dir;
}

// ---- symbol index ---------------------------------------------------------------------------
const EXT = new Set(['.js', '.mjs', '.ts', '.tsx', '.svelte', '.rs']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'lib', 'vendor', '.svelte-kit', 'target',
    'tests', 'e2e', '__tests__', 'locales', 'i18n', 'third-party', 'gen', 'quick-image-gen']);
const KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'constructor']);
const PATS = [
    [/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/, 'fn'],
    [/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, 'class'],
    [/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, 'const'],
    [/^export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, 'type'],
    [/^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, 'fn'],
    [/^ {2,4}(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/, 'method'],
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/, 'fn'],
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/, 'type'],
];

function walk(dir, out) {
    if (statSync(dir).isFile()) { out.push(dir); return out; }
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(p, out); }
        else if (EXT.has(extname(e.name)) && !/\.(test|spec|min|d)\./.test(e.name)) out.push(p);
    }
    return out;
}

function symbolsFor(repoDir, subdirs) {
    const lines = [];
    for (const s of subdirs) {
        const base = join(repoDir, s);
        if (!existsSync(base)) { console.warn(`  (missing ${s})`); continue; }
        for (const file of walk(base, [])) {
            const src = readFileSync(file, 'utf8').split(/\r?\n/);
            const svelte = file.endsWith('.svelte');
            let inScript = !svelte;
            const syms = [];
            src.forEach((raw, i) => {
                let l = raw;
                if (svelte) {
                    if (l.includes('<script')) { inScript = true; return; }
                    if (l.includes('</script>')) { inScript = false; return; }
                    if (!inScript) return;
                    l = l.replace(/^\t/, '');
                }
                for (const [rx, kind] of PATS) {
                    const m = rx.exec(l);
                    if (!m) continue;
                    if (!KW.has(m[1])) syms.push(`  L${i + 1} ${kind} ${m[1]}`);
                    break;
                }
            });
            lines.push(`${relative(repoDir, file).split(sep).join('/')} (${src.length})`, ...syms);
        }
    }
    return lines;
}

// ---- path check -----------------------------------------------------------------------------
// Every `path/to/file.ext` or `path/to/file.ext:123` written in a map must exist in its repo.
function checkDocs() {
    let bad = 0;
    for (const [name, repo] of Object.entries(pins.repos)) {
        const doc = join(docDir, repo.map);
        const repoDir = join(refsDir, name);
        if (!existsSync(doc) || !existsSync(repoDir)) continue;
        const text = readFileSync(doc, 'utf8');
        // Maps may shorten a path inside a section ("ai/generation/X.ts" under "src/lib/services/"),
        // so a cited path is valid if it is a suffix of exactly one file in the repo.
        const all = git(repoDir, 'ls-files').split('\n');
        for (const m of text.matchAll(/`([\w@.\-/]+\/[\w@.\-]+\.(?:js|mjs|ts|tsx|svelte|rs|json|md|sql))(?::(\d+))?`/g)) {
            const hits = all.filter((f) => f === m[1] || f.endsWith('/' + m[1]));
            if (hits.length !== 1) {
                console.log(`  ${repo.map}: ${hits.length ? 'ambiguous' : 'missing'} ${m[1]}`); bad++; continue;
            }
            const p = join(repoDir, hits[0]);
            if (m[2] && Number(m[2]) > readFileSync(p, 'utf8').split('\n').length) {
                console.log(`  ${repo.map}: ${m[1]}:${m[2]} is past the end of the file`); bad++;
            }
        }
    }
    console.log(bad ? `${bad} broken reference(s).` : 'All cited paths exist.');
    return bad;
}

// ---- main -----------------------------------------------------------------------------------
if (!args.has('--check')) {
    mkdirSync(join(docDir, 'symbols'), { recursive: true });
    for (const [name, repo] of Object.entries(pins.repos)) {
        console.log(`${name}: fetching ${args.has('--latest') ? repo.branch : repo.commit.slice(0, 10)}…`);
        const dir = fetchRepo(name, repo);
        const lines = symbolsFor(dir, repo.symbols);
        const header = `# ${name} @ ${repo.commit} (${repo.date}) — generated by scripts/refs.mjs, do not edit\n` +
            '# Format: path (line count) then "  L<line> <kind> <name>". Search with grep/rg, never read whole.\n';
        writeFileSync(join(docDir, 'symbols', `${name}.txt`), header + lines.join('\n') + '\n');
        console.log(`  ${lines.length} lines → docs/reference/symbols/${name}.txt`);
    }
    writeFileSync(pinsFile, JSON.stringify(pins, null, 4) + '\n');
}
process.exitCode = checkDocs() ? 1 : 0;
