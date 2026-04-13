import type { LanguagePair, LookupOptions, LookupResult } from '../types';

export type DictionaryProvider = {
    readonly name: string;
    readonly languagePairs: readonly LanguagePair[];
    supports(languagePair: LanguagePair): boolean;
    lookup(
        query: string,
        languagePair: LanguagePair,
        options?: LookupOptions,
    ): Promise<LookupResult>;
};
