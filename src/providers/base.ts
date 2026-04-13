import type {
    DictionaryEntry,
    DictionarySection,
    DictionaryTerm,
    LanguagePair,
    LookupOptions,
    LookupResult,
} from '../types';

import {
    DEFAULT_USER_AGENT,
    normalizeText,
    toAbsoluteUrl,
    withTimeout,
} from './utils';

export { DEFAULT_USER_AGENT, normalizeText, toAbsoluteUrl, withTimeout };

export abstract class BaseDictionaryProvider {
    public abstract readonly name: string;
    public abstract readonly languagePairs: LanguagePair[];

    abstract supports(languagePair: LanguagePair): boolean;
    abstract buildUrl(languagePair: LanguagePair, query: string): string;
    abstract parseHtml(html: string): DictionarySection[];
    abstract readonly typeMap: Record<string, string>;

    protected mapType(rawType: string): string {
        return this.typeMap[rawType] ?? rawType;
    }

    protected async fetchHtml(
        url: string,
        options: LookupOptions,
    ): Promise<string> {
        const response = await fetch(url, {
            headers: {
                'user-agent': options.userAgent ?? DEFAULT_USER_AGENT,
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: withTimeout(options.signal, options.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(
                `${this.name} request failed: ${response.status} ${response.statusText}`,
            );
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
            throw new Error(
                `${this.name} returned unexpected content-type: ${contentType}`,
            );
        }

        const html = await response.text();
        if (html.length > 5 * 1024 * 1024) {
            throw new Error(
                `${this.name} response is too large (${html.length} bytes)`,
            );
        }

        return html;
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

        const url = this.buildUrl(languagePair, query);
        const html = await this.fetchHtml(url, options);

        return {
            provider: this.name,
            query,
            languagePair,
            sections: this.parseHtml(html),
            raw: { url },
        };
    }
}

export type { DictionaryEntry, DictionarySection, DictionaryTerm };
