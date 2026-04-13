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

const LEO_BASE = 'https://dict.leo.org';

const LANGUAGE_PATHS: Partial<Record<LanguagePair, string>> = {
    'de-en': 'german-english',
    'en-de': 'english-german',
    'de-fr': 'german-french',
    'fr-de': 'french-german',
};

function extractTerm(
    $: cheerio.CheerioAPI,
    $termCell: cheerio.Cheerio<any>,
    $audioEl: cheerio.Cheerio<any>,
): DictionaryTerm | null {
    // Primary text is inside <samp>; fall back to the whole cell.
    const text = normalizeText(
        $termCell.find('samp').first().text() || $termCell.text(),
    );
    if (!text) return null;

    // First dictionary link inside <samp>.
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

export class LeoProvider implements DictionaryProvider {
    public readonly name = 'leo';
    public readonly languagePairs = Object.keys(
        LANGUAGE_PATHS,
    ) as LanguagePair[];

    supports(languagePair: LanguagePair): boolean {
        return languagePair in LANGUAGE_PATHS;
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

        const url = `${LEO_BASE}/${LANGUAGE_PATHS[languagePair]}/${encodeURIComponent(query)}`;

        const response = await fetch(url, {
            headers: {
                'user-agent': options.userAgent ?? DEFAULT_USER_AGENT,
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: withTimeout(options.signal, options.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(
                `LEO request failed: ${response.status} ${response.statusText}`,
            );
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
            throw new Error(
                `LEO returned unexpected content-type: ${contentType}`,
            );
        }

        const html = await response.text();
        if (html.length > 5 * 1024 * 1024) {
            throw new Error(`LEO response is too large (${html.length} bytes)`);
        }

        return {
            provider: this.name,
            query,
            languagePair,
            sections: this.parseHtml(html),
            raw: { url },
        };
    }

    parseHtml(html: string): DictionarySection[] {
        const $ = cheerio.load(html);
        const sections: DictionarySection[] = [];

        // Sections are divs with data-dz-name (e.g. "subst", "verb").
        // The <script data-dz-name="searchresult"> metadata tag is excluded by scoping to div.
        $('div[data-dz-name]').each((i, sectionEl) => {
            const $section = $(sectionEl);
            const type = $section.attr('data-dz-name');
            if (!type) return;

            const entries: DictionaryEntry[] = [];

            $section.find("tr[data-dz-ui='dictentry']").each((j, row) => {
                const $row = $(row);

                // Term cells identify themselves: td[data-dz-attr="relink"][lang].
                const $termCells = $row.find("td[data-dz-attr='relink'][lang]");
                if ($termCells.length < 2) return;

                // Audio elements appear in document order: source first, target second.
                const $audioEls = $row.find(
                    "i[data-dz-ui='dictentry:playLeoAudio']",
                );

                const $sourceCell = $termCells.eq(0);
                const $targetCell = $termCells.eq(1);

                const source = extractTerm($, $sourceCell, $audioEls.eq(0));
                const target = extractTerm($, $targetCell, $audioEls.eq(1));

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
