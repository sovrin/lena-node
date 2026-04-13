import * as cheerio from 'cheerio';

import type {
    DictionaryEntry,
    DictionarySection,
    DictionaryTerm,
    LanguagePair,
    LookupOptions,
    LookupResult,
} from '../../types';
import type { DictionaryProvider } from '../index';

import {
    DEFAULT_USER_AGENT,
    normalizeText,
    toAbsoluteUrl,
    withTimeout,
} from '../utils';

// dict.cc uses subdomains for language pairs.
// de-en is the default (www.dict.cc); others follow the pattern <l1><l2>.dict.cc.
const DICTCC_BASES: Partial<Record<LanguagePair, string>> = {
    'de-en': 'https://www.dict.cc',
    'en-de': 'https://www.dict.cc',
    'de-fr': 'https://defr.dict.cc',
    'fr-de': 'https://defr.dict.cc',
};

// Language codes used in the audio URL (ISO 639-1).
const LANG_CODES: Partial<
    Record<LanguagePair, [source: string, target: string]>
> = {
    'de-en': ['de', 'en'],
    'en-de': ['en', 'de'],
    'de-fr': ['de', 'fr'],
    'fr-de': ['fr', 'de'],
};

// Strip leading word-count qualifiers like "2 Words: Verbs" → "Verbs",
// "5+ Words: Others" → "Others", "Nouns" → "Nouns".
function normalizeType(raw: string): string {
    return raw.replace(/^\d+\+?\s+Words?:\s+/i, '').trim();
}

type AudioMeta = {
    // idArr[rowIndex] → entry ID; srcStr[rowIndex - 1] → 'h'/'c' = has audio, 'u' = none.
    ids: number[];
    availability: string;
    sourceLang: string;
    targetLang: string;
};

// Parse the idArr and srcStr JS variables embedded in the page script.
function parseAudioMeta(
    html: string,
    languagePair: LanguagePair,
): AudioMeta | null {
    const langs = LANG_CODES[languagePair];
    if (!langs) return null;

    const idMatch = html.match(/var idArr\s*=\s*new Array\(([^)]+)\)/);
    const srcMatch = html.match(/var srcStr\s*=\s*"([^"]+)"/);
    if (!idMatch || !srcMatch) return null;

    const ids = idMatch[1].split(',').map((s) => parseInt(s.trim(), 10));
    if (ids.some(isNaN)) return null;

    return {
        ids,
        availability: srcMatch[1],
        sourceLang: langs[0],
        targetLang: langs[1],
    };
}

function audioUrl(
    entryId: number,
    sourceLang: string,
    targetLang: string,
): string {
    const lp = `${sourceLang.toUpperCase()}${targetLang.toUpperCase()}`;
    return `https://audio.dict.cc/speak.audio.v2.php?type=mp3&id=${entryId}&lang=${targetLang}_rec_ip&lp=${lp}`;
}

function extractTerm(
    $: cheerio.CheerioAPI,
    $cell: cheerio.Cheerio<any>,
    base: string,
    entryId?: number,
    sourceLang?: string,
    targetLang?: string,
): DictionaryTerm | null {
    // The vote-count float sits inside the target cell — clone and remove it
    // so it doesn't contaminate the text.
    const $clone = $cell.clone();
    $clone.find('div').remove();

    const text = normalizeText($clone.text());
    if (!text) return null;

    // First link in the cell points to the primary term.
    const href = $cell.find('a[href]').first().attr('href');

    return {
        text,
        url: toAbsoluteUrl(href, base),
        audioUrl:
            entryId && sourceLang && targetLang
                ? audioUrl(entryId, sourceLang, targetLang)
                : undefined,
    };
}

export class DictCcProvider implements DictionaryProvider {
    public readonly name = 'dictcc';
    public readonly languagePairs = Object.keys(DICTCC_BASES) as LanguagePair[];

    supports(languagePair: LanguagePair): boolean {
        return languagePair in DICTCC_BASES;
    }

    async lookup(
        query: string,
        languagePair: LanguagePair,
        options: LookupOptions = {},
    ): Promise<LookupResult> {
        if (!query.trim()) throw new Error('Query must not be empty.');
        if (!this.supports(languagePair)) {
            throw new Error(
                `Provider "${this.name}" does not support ${languagePair}.`,
            );
        }

        const base = DICTCC_BASES[languagePair]!;
        const url = `${base}/?s=${encodeURIComponent(query)}`;

        const response = await fetch(url, {
            headers: {
                'user-agent': options.userAgent ?? DEFAULT_USER_AGENT,
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: withTimeout(options.signal, options.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(
                `dict.cc request failed: ${response.status} ${response.statusText}`,
            );
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
            throw new Error(
                `dict.cc returned unexpected content-type: ${contentType}`,
            );
        }

        const html = await response.text();
        if (html.length > 5 * 1024 * 1024) {
            throw new Error(
                `dict.cc response is too large (${html.length} bytes)`,
            );
        }

        return {
            provider: this.name,
            query,
            languagePair,
            sections: this.parseHtml(html, base, languagePair),
            raw: { url },
        };
    }

    parseHtml(
        html: string,
        base = 'https://www.dict.cc',
        languagePair: LanguagePair = 'de-en',
    ): DictionarySection[] {
        const $ = cheerio.load(html);
        const audio = parseAudioMeta(html, languagePair);

        // Results live inside the main results table. We walk all <tr>s and
        // track the current section type set by header rows.
        const sectionMap = new Map<string, DictionaryEntry[]>();
        let currentType = 'Other';

        $('tr').each((_, row) => {
            const $row = $(row);

            // Section header: a single td.td6 spanning all columns.
            const $header = $row.find("td.td6[colspan='4']");
            if ($header.length) {
                currentType = normalizeType(normalizeText($header.text()));
                return;
            }

            // Translation row: identified by the id^='tr' pattern.
            const rowId = $row.attr('id');
            if (!rowId?.startsWith('tr')) return;

            const $cells = $row.find('td.td7nl');
            if ($cells.length < 2) return;

            // Row index matches idArr and srcStr (tr1 → index 1).
            const rowIndex = parseInt(rowId.slice(2), 10);
            const entryId = audio?.ids[rowIndex];
            const hasAudio =
                audio && entryId
                    ? audio.availability[rowIndex - 1] !== 'u'
                    : false;

            const id = hasAudio ? entryId : undefined;

            const source = extractTerm(
                $,
                $cells.eq(0),
                base,
                id,
                audio?.sourceLang,
                audio?.targetLang,
            );
            const target = extractTerm(
                $,
                $cells.eq(1),
                base,
                id,
                audio?.sourceLang,
                audio?.targetLang,
            );
            if (!source || !target) return;

            if (!sectionMap.has(currentType)) {
                sectionMap.set(currentType, []);
            }
            sectionMap.get(currentType)!.push({ source, target });
        });

        return Array.from(sectionMap, ([type, entries]) => ({ type, entries }));
    }
}
