/**
 * Builds a prompt section from user-selected lorebooks for World Skeleton generation.
 * Skeleton books are deliberately excluded so generated seed data cannot recursively
 * become source canon for a new skeleton.
 *
 * @param {string[]} bookNames
 * @param {(bookName: string) => Promise<any>} loadWorldInfo
 * @param {{ lorebookOnly?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function buildSkeletonLorebookSourceContext(bookNames, loadWorldInfo, options = {}) {
    const names = [...new Set((bookNames || [])
        .map(name => String(name || '').trim())
        .filter(name => name && !name.toLowerCase().endsWith('_skeleton')))]
        .sort((a, b) => a.localeCompare(b));

    const books = [];
    for (const bookName of names) {
        try {
            const book = await loadWorldInfo(bookName);
            if (book?.entries) books.push([bookName, book]);
        } catch (_) {
            // A deleted or temporarily unavailable selected book should not abort generation.
        }
    }

    const formattedBooks = books.map(([bookName, book]) => {
        const entries = Object.entries(book.entries || {})
            .sort(([uidA], [uidB]) => Number(uidA) - Number(uidB))
            .map(([uid, entry]) => {
                const content = String(entry?.content || '').trim();
                if (!content) return '';
                const firstKey = Array.isArray(entry?.key) ? entry.key.find(Boolean) : '';
                const title = String(entry?.comment || firstKey || `Entry ${uid}`).trim();
                return `#### ${title}\n${content}`;
            })
            .filter(Boolean);
        if (!entries.length) return '';
        return `### LOREBOOK: ${bookName}\n${entries.join('\n\n')}`;
    }).filter(Boolean);

    if (!formattedBooks.length) return '';

    const sourceRule = options.lorebookOnly
        ? 'Create entries only for factions, locations, and conflicts explicitly mentioned in this material. Do not invent, infer, or extrapolate additional premises. Ignore the requested category counts and output the eligible macro premises established by the source material. Named individuals remain source constraints and must never become skeleton entries.'
        : 'Ground the generated factions, locations, and conflicts in it; preserve its facts and tone, and do not contradict it. Named individuals remain source constraints and must never become skeleton entries. You may derive macro premises from the material or create compatible additions.';

    return `## EXISTING LOREBOOK SOURCE MATERIAL
Treat the following material as established world canon. ${sourceRule}

${formattedBooks.join('\n\n')}`;
}

/**
 * Parses the raw LLM output from the skeleton generation pass into macro
 * premise records, grouped by section header (## FACTIONS, ## LOCATIONS, etc.).
 * Supports English and Spanish section headers with/without accents.
 * Returns an array of { label, content, category } objects.
 * @param {string} rawText
 * @returns {Array<{label: string, content: string, category: string}>}
 */
export function parseSkeletonOutput(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    const categoryMap = {
        'FACTIONS': 'FAC',
        'FACTION': 'FAC',
        'FACCIONES': 'FAC',
        'FACCION': 'FAC',
        'LOCATIONS': 'LOC',
        'LOCATION': 'LOC',
        'UBICACIONES': 'LOC',
        'UBICACION': 'LOC',
        'LOCALIZACIONES': 'LOC',
        'LOCALIZACION': 'LOC',
        'LUGARES': 'LOC',
        'LUGAR': 'LOC',
        'CONFLICTS': 'EVENT',
        'CONFLICT': 'EVENT',
        'CONFLICTOS': 'EVENT',
        'CONFLICTO': 'EVENT',
        'EVENTS': 'EVENT',
        'EVENT': 'EVENT',
        'EVENTOS': 'EVENT',
        'EVENTO': 'EVENT',
    };

    const records = [];
    const lines = rawText.split('\n');
    
    let currentCategory = null;
    let currentItem = null;

    const sectionRegex = /^##\s+([A-Za-zÀ-ÿ]+)/i;
    const subHeaderRegex = /^###\s+(.+)/;
    const listRegexBold = /^\s*(?:[\*\-\d\.\s]*)\s*\*\*(.+?)\*\*\s*[:\-]?\s*(.*)/;
    const listRegexPlain = /^\s*(?:[\*\-\d\.\s]*)\s*([^:\-\n]+)\s*[:\-]\s*(.*)/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // 1. Check for ## Section Header
        const secMatch = line.match(sectionRegex);
        if (secMatch) {
            if (currentItem) {
                records.push(currentItem);
                currentItem = null;
            }
            const rawKey = secMatch[1].toUpperCase();
            const normalizedKey = rawKey.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            currentCategory = categoryMap[normalizedKey] || categoryMap[rawKey] || null;
            continue;
        }

        // Unknown sections — notably the retired NPC/NPCS category emitted by
        // an old custom prompt — are intentionally ignored.
        if (!currentCategory) continue;

        // 2. Check for ### Sub-header
        const subMatch = line.match(subHeaderRegex);
        if (subMatch) {
            if (currentItem) {
                records.push(currentItem);
            }
            currentItem = {
                label: subMatch[1].trim(),
                content: '',
                category: currentCategory
            };
            continue;
        }

        // 3. Bold names are explicit entry titles. A plain `Name: description`
        // line is only a title when no entry is open; otherwise it is ordinary
        // content such as `Parties involved:` or a hyphenated description.
        let listMatch = line.match(listRegexBold);
        if (!listMatch && !currentItem) {
            listMatch = line.match(listRegexPlain);
        }
        if (listMatch) {
            if (currentItem) {
                records.push(currentItem);
            }
            currentItem = {
                label: listMatch[1].trim(),
                content: listMatch[2].trim(),
                category: currentCategory
            };
            continue;
        }

        // 4. Append to existing item content
        if (currentItem) {
            if (trimmedLine) {
                if (currentItem.content) {
                    currentItem.content += ' ' + trimmedLine;
                } else {
                    currentItem.content = trimmedLine;
                }
            }
        }
    }

    if (currentItem) {
        records.push(currentItem);
    }

    // Clean up content strings (collapse multiple spaces, remove quotes)
    for (const rec of records) {
        rec.content = rec.content.replace(/\s+/g, ' ').trim();
        if (rec.content.startsWith('"') && rec.content.endsWith('"')) {
            rec.content = rec.content.slice(1, -1).trim();
        }
        if (rec.content.startsWith("'") && rec.content.endsWith("'")) {
            rec.content = rec.content.slice(1, -1).trim();
        }
    }

    return records.filter(r => r.label && r.content && ['FAC', 'LOC', 'EVENT'].includes(r.category));
}
