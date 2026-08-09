/**
 * Card-list synopsis helpers for PC / NPC cards in the Lorebook Agent panel.
 */

/**
 * Brief synopsis for the card list: Species + Body (new split), else legacy
 * Appearance/Species, else the first couple of meaningful lines.
 * @param {string} content
 * @param {(text: string) => string} [substitute] display-macro substitution
 * @returns {string}
 */
export function getCardAppearanceSynopsis(content, substitute = (s) => s) {
    if (!content) return '';
    const cleanContent = content.replace(/\[\/?CORE\]/gi, '');
    const nextHeader =
        'Species|Body|Worn Equipment|Equipment|Appearance\\/Species|Appearance|Personality|Brief Background|Background|Habits(?:\\/|\\s*&\\s*|\\s+and\\s+)Behaviors|Habits|Behaviors|Strengths|Flaws|Combat Profile|Relationship with|Friendship\\/Rapport|Affection\\/Interest';
    const extractField = (name) => {
        const re = new RegExp(
            `(?:^|\\n)\\s*${name}\\s*:\\s*([\\s\\S]*?)(?=\\s*(?:${nextHeader})\\s*:|$)`,
            'i',
        );
        const m = cleanContent.match(re);
        return m?.[1]?.trim() || '';
    };

    // `(?:^|\n)\s*Species:` does not match inside legacy `Appearance/Species:`.
    const species = extractField('Species');
    const body = extractField('Body');
    const parts = [];
    if (species) parts.push(species);
    if (body) parts.push(body);
    if (parts.length) {
        return substitute(parts.join(' — ').substring(0, 260));
    }

    const legacy = extractField('Appearance\\/Species') || extractField('Appearance');
    if (legacy) {
        return substitute(legacy.substring(0, 260));
    }

    const lines = cleanContent.split('\n').map(l => l.trim())
        .filter(l => l
            && !/^\[ID:/i.test(l)
            && !/^Friendship\/Rapport:/i.test(l)
            && !/^Affection\/Interest:/i.test(l)
            && !/^(?:Species|Body|Worn Equipment|Equipment|Appearance(?:\/Species)?)\s*:?\s*$/i.test(l));
    return substitute(lines.slice(0, 2).join(' ').substring(0, 260));
}
