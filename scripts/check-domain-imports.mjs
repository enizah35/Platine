// Règle d'architecture : src/domain/** est pur. Il n'importe ni les adaptateurs, ni Discord,
// ni les bibliothèques d'infrastructure. Ce script fait échouer la CI sinon.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'src/domain';
const FORBIDDEN = [
  /from\s+['"](\.\.\/)+(adapters|discord|ops|config)\b/,
  /from\s+['"]src\/(adapters|discord|ops|config)\b/,
  /from\s+['"](discord\.js|shoukaku|lavalink-client|drizzle-orm|drizzle-orm\/[^'"]*|undici|pg|postgres|pino|@electric-sql\/pglite)['"]/,
];

function walk(dir) {
  let files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files = files.concat(walk(p));
    else if (p.endsWith('.ts')) files.push(p);
  }
  return files;
}

let errors = 0;
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (FORBIDDEN.some((re) => re.test(line))) {
      console.error(`${relative('.', file)}:${i + 1} import interdit dans le domaine : ${line.trim()}`);
      errors++;
    }
  });
}
if (errors > 0) {
  console.error(
    `\n${errors} import(s) interdit(s) dans src/domain. Le domaine doit rester pur (voir plan §3).`,
  );
  process.exit(1);
}
console.log('check-domain-imports : OK');
