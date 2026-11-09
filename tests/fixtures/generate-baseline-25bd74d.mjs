#!/usr/bin/env node
/**
 * Genera el fixture «world-progression-baseline-25bd74d.json» que usa el test
 * (g) de byte-identidad de la Oleada 6a (D-19/D-20), spec
 * docs/specs/2026-11-09-oleada6-blindaje-gm-only.spec.md (T9-g).
 *
 * Cómo se obtiene la línea base (esto es lo que documenta el test):
 *   1. Se verifica que «world-progression-lib.js», «dungeon-reality.js» y
 *      «memo-processor.js» en disco son byte a byte idénticos a la revisión
 *      25bd74d («git show 25bd74d:<ruta>»). Si alguno difiere, el script
 *      aborta: la línea base solo puede generarse con el motor intacto,
 *      es decir, antes de tocar la librería en esta rama.
 *   2. El arnés «books» se extrae literalmente de
 *      «git show 25bd74d:tests/world-progression-lib.test.js» y se exige que
 *      el bloque sea idéntico al del fichero de trabajo en curso.
 *   3. Se llama a «buildWorldProgressionLocationDossiers(books, { prefix:
 *      'Campaign' })» SIN techos —conductura idéntica a techo 0 por D-20— y
 *      se guarda «JSON.stringify(resultado, null, 2)» como fixture.
 *
 * Ejecución: node tests/fixtures/generate-baseline-25bd74d.mjs (requiere git).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorldProgressionLocationDossiers } from '../../world-progression-lib.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REV = '25bd74d';
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const gitShow = ruta => execFileSync('git', ['show', `${REV}:${ruta}`], { cwd: REPO, maxBuffer: 32 * 1024 * 1024 });

let abortado = 0;
for (const ruta of ['world-progression-lib.js', 'dungeon-reality.js', 'memo-processor.js']) {
    if (sha256(gitShow(ruta)) !== sha256(readFileSync(path.join(REPO, ruta)))) {
        console.error(`✗ ${ruta} difiere de ${REV}: la línea base exige el motor intacto.`);
        abortado = 1;
    }
}

// El bloque del arnés debe ser idéntico en la revisión base y en el fichero de
// trabajo; así el fixture describe exactamente los libros que compara el test.
const extraerBloqueBooks = src => {
    const m = src.match(/const books = \{[\s\S]*?\n\};/);
    if (!m) throw new Error('No se encontró el arnés «books» en el fichero de tests.');
    return m[0];
};
const bloqueBase = extraerBloqueBooks(gitShow('tests/world-progression-lib.test.js').toString('utf8'));
const bloqueDisco = extraerBloqueBooks(readFileSync(path.join(REPO, 'tests/world-progression-lib.test.js'), 'utf8'));
if (bloqueBase !== bloqueDisco) {
    console.error(`✗ El arnés «books» del fichero de trabajo difiere byte a byte del de ${REV}.`);
    abortado = 1;
}
if (abortado) process.exit(1);

// El arnés es un literal de objeto de este propio repositorio: se evalúa tal cual.
const books = eval(`(${bloqueBase.replace(/^const books = /, '').replace(/;$/, '')})`);
const resultado = buildWorldProgressionLocationDossiers(books, { prefix: 'Campaign' });
const salida = JSON.stringify(resultado, null, 2);
writeFileSync(path.join(REPO, 'tests/fixtures/world-progression-baseline-25bd74d.json'), `${salida}\n`);
console.log(`✓ Línea base ${REV} generada: ${resultado.dossiers.length} expedientes, globalContext de ${resultado.globalContext.length} caracteres.`);
