import * as cheerio from 'cheerio';

import type {
    DictionaryEntry,
    DictionarySection,
    DictionaryTerm,
    LanguagePair,
} from '../../types';

import { BaseDictionaryProvider, toAbsoluteUrl } from '../base';

const LEO_BASE = 'https://dict.leo.org';

const LANGUAGE_PATHS: Partial<Record<LanguagePair, string>> = {
    'de-en': 'english-german',
    'en-de': 'german-english',
    'de-fr': 'french-german',
    'fr-de': 'german-french',
}

const TYPE_MAP: Record<string, string> = {
    subst: 'noun',
    verb: 'verb',
    adjadv: 'adjective',
    definition: 'definition',
    phrase: 'phrase',
};

function extractTerm(
    $: cheerio.CheerioAPI,
    $termCell: cheerio.Cheerio<any>,
    $audioEl: cheerio.Cheerio<any>,
): DictionaryTerm | null {
    const text = normalizeText(
        $termCell.find('samp').first().text() || $termCell.text(),
    );
    if (!text) return null;

    const href = $termCell.find('samp a[href]').first().attr('href');
    const audioId = $audioEl.attr('data-dz-rel-audio');

    return {
        text,
        url: toAbsoluteUrl(href, LEO_BASE),
        audioUrl: audioId
            ? `${LEO_BASE}/media/audio/${audioId}.ogg`
            : undefined,
    };
}

function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export class LeoProvider extends BaseDictionaryProvider {
    public readonly name = 'leo';
    public readonly languagePairs = Object.keys(
        LANGUAGE_PATHS,
    ) as LanguagePair[];
    public readonly typeMap: Record<string, string> = TYPE_MAP;

    supports(languagePair: LanguagePair): boolean {
        return languagePair in LANGUAGE_PATHS;
    }

    buildUrl(languagePair: LanguagePair, query: string): string {
        return `${LEO_BASE}/${LANGUAGE_PATHS[languagePair]}/${encodeURIComponent(query)}`;
    }

    parseHtml(html: string): DictionarySection[] {
        const $ = cheerio.load(html);
        const sections: DictionarySection[] = [];

        $('div[data-dz-name]').each((i, sectionEl) => {
            const $section = $(sectionEl);
            const rawType = $section.attr('data-dz-name');
            if (!rawType) return;

            const type = this.mapType(rawType);

            const entries: DictionaryEntry[] = [];

            $section.find("tr[data-dz-ui='dictentry']").each((j, row) => {
                const $row = $(row);

                const $termCells = $row.find("td[data-dz-attr='relink'][lang]");
                if ($termCells.length < 2) return;

                const $audioEls = $row.find(
                    "i[data-dz-ui='dictentry:playLeoAudio']",
                );

                const source = extractTerm(
                    $,
                    $termCells.eq(0),
                    $audioEls.eq(0),
                );
                const target = extractTerm(
                    $,
                    $termCells.eq(1),
                    $audioEls.eq(1),
                );

                if (!source || !target) return;

                entries.push({ source, target });
            });

            if (entries.length > 0) {
                sections.push({ type, entries });
            }
        });

        return sections;
    }
}
