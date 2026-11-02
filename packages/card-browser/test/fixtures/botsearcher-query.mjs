// Verbatim query splitter and search builder from SillyBunnyTeam/SillyBunny-BotSearcher
// 2e175ff439f884fc0bb662ff9930212237053780/server/sources/botbooru.js, AGPL-3.0.
// Test harness exports/stubs by CODEX, 2026-11-02.
const BASE = "https://botbooru.com";
const SORTS = ["latest", "curated", "downloads", "favorites", "views", "random"];
const QUERY_PREFIXES = ["writer", "character", "artist", "copyright", "scenario", "language", "meta"];
const own = (o, k) => o?.[k];
const pick = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;
const clampInt = (v, min, max, fallback) => Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback;
const offsetCursor = (cursor) => cursor?.o ?? 0;
function splitQuery(raw) {
    const exact = [];
    const text = [];
    const tokens = typeof raw === 'string' ? raw.slice(0, 128).trim().split(/\s+/) : [];

    for (const token of tokens) {
        if (token === '') {
            continue;
        }
        const hasKnownPrefix = QUERY_PREFIXES.some((prefix) => token.startsWith(`${prefix}:`));
        if (hasKnownPrefix || token.startsWith('-')) {
            exact.push(token);
        } else {
            text.push(token);
        }
    }

    return { exact, text };
}

/** One filter value must remain one exact-tag token in Botbooru's syntax. */
function tagTerm(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, '_') : '';
}


export const original = {    buildSearchUrl({ query, cursor, limit, sort, sfwOnly, hideAi, filters }) {
        const pageSize = clampInt(limit, 1, 48, 24);
        const start = offsetCursor(cursor);
        const url = new URL('/posts/', BASE);
        url.searchParams.set('limit', String(pageSize));
        url.searchParams.set('offset', String(start));
        url.searchParams.set('sort', pick(sort, SORTS, 'latest'));

        const split = splitQuery(query);
        const exact = [...split.exact];

        const tags = own(filters, 'tags');
        if (Array.isArray(tags)) {
            exact.push(...tags.map(tagTerm).filter((term) => term !== ''));
        }
        const excludeTags = own(filters, 'excludeTags');
        if (Array.isArray(excludeTags)) {
            exact.push(...excludeTags.map(tagTerm).filter((term) => term !== '').map((term) => `-${term}`));
        }

        for (const [key, prefix] of [
            ['writer', 'writer'],
            ['character', 'character'],
            ['franchise', 'copyright'],
        ]) {
            const value = tagTerm(own(filters, key));
            if (value !== '') {
                exact.push(`${prefix}:${value}`);
            }
        }

        if (exact.length > 0) {
            url.searchParams.set('q', exact.join(' '));
        }
        if (split.text.length > 0) {
            url.searchParams.set('qtext', split.text.join(' '));
        }
        if (sfwOnly) {
            url.searchParams.set('sfw_only', 'true');
        }
        if (hideAi) {
            url.searchParams.set('hide_ai', 'true');
        }

        for (const [key, parameter] of [
            ['minTokens', 'min_tokens'],
            ['maxTokens', 'max_tokens'],
            ['uploadedAfter', 'uploaded_after'],
            ['uploadedBefore', 'uploaded_before'],
        ]) {
            const value = own(filters, key);
            if (typeof value === 'number' || typeof value === 'string') {
                url.searchParams.set(parameter, String(value));
            }
        }
        if (own(filters, 'ocOnly') === true) {
            url.searchParams.set('oc_only', 'true');
        }

        return url;
    },

};
