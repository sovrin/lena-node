import * as cheerio from 'cheerio';

import type {
    DictionaryEntry,
    DictionarySection,
    DictionaryTerm,
    LanguagePair,
} from '../../types';

import { BaseDictionaryProvider, normalizeText, toAbsoluteUrl } from '../base';

const DICTCC_BASES: Partial<Record<LanguagePair, string>> = {
    'de-en': 'https://www.dict.cc',
    'en-de': 'https://www.dict.cc',
    'de-fr': 'https://defr.dict.cc',
    'fr-de': 'https://defr.dict.cc',
};

const LANG_CODES: Partial<
    Record<LanguagePair, [source: string, target: string]>
> = {
    'de-en': ['de', 'en'],
    'en-de': ['en', 'de'],
    'de-fr': ['de', 'fr'],
    'fr-de': ['fr', 'de'],

const TYPE_MAP: Record<string, string> = {
    Verbs: 'verb',
    Nouns: 'noun',
    Others: 'other',
};

function normalizeType(raw: string): string {
    return raw.replace(/^\d+\+?\s+Words?:\s+/i, '').trim();
}

type AudioMeta = {
    ids: number[];
    availability: string;
    sourceLang: string;
    targetLang: string;
};

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
    const $clone = $cell.clone();
    $clone.find('div').remove();

    const text = normalizeText($clone.text());
    if (!text) return null;

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

export class DictCcProvider extends BaseDictionaryProvider {
    public readonly name = 'dictcc';
    public readonly languagePairs = Object.keys(DICTCC_BASES) as LanguagePair[];
    public readonly typeMap: Record<string, string> = TYPE_MAP;

    supports(languagePair: LanguagePair): boolean {
        return languagePair in DICTCC_BASES;
    }

    buildUrl(languagePair: LanguagePair, query: string): string {
        const base = DICTCC_BASES[languagePair]!;
        return `${base}/?s=${encodeURIComponent(query)}`;
    }

    parseHtml(html: string): DictionarySection[] {
        const $ = cheerio.load(html);
        const audio = parseAudioMeta(html, this.languagePairs[0]);

        const sectionMap = new Map<string, DictionaryEntry[]>();
        let currentType = 'other';

        $('tr').each((_, row) => {
            const $row = $(row);

            const $header = $row.find("td.td6[colspan='4']");
            if ($header.length) {
                const rawType = normalizeType(normalizeText($header.text()));
                currentType = this.mapType(rawType);
                return;
            }

            const rowId = $row.attr('id');
            if (!rowId?.startsWith('tr')) return;

            const $cells = $row.find('td.td7nl');
            if ($cells.length < 2) return;

            const rowIndex = parseInt(rowId.slice(2), 10);
            const entryId = audio?.ids[rowIndex];
            const hasAudio =
                audio && entryId
                    ? audio.availability[rowIndex - 1] !== 'u'
                    : false;

            const id = hasAudio ? entryId : undefined;

            const base = DICTCC_BASES[this.languagePairs[0]]!;
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
