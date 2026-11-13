/**
 * Regra de texto do projeto: nenhum travessão (U+2014) ou meia-risca (U+2013)
 * em código de tela. Roda em npm run check. Comentário de código também
 * conta, para o hábito não voltar.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const banned = /[\u2013\u2014]/;
const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css|html)$/.test(name)) {
      readFileSync(p, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (banned.test(line)) hits.push(`${p}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
    }
  }
}
walk('src');
walk('public');
if (hits.length) {
  console.error('Travessão encontrado (use hífen, vírgula, ponto ou dois-pontos):');
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
console.log('check:copy ok, nenhum travessão.');
