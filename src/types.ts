export type LanguagePair = `${string}-${string}`;

export type DictionaryTerm = {
    text: string;
    url?: string;
    audioUrl?: string;
};

export type DictionaryEntry = {
    source: DictionaryTerm;
    target: DictionaryTerm;
};

export type DictionarySection = {
    type: string;
    entries: DictionaryEntry[];
};

export type LookupResult = {
    provider: string;
    query: string;
    languagePair: LanguagePair;
    sections: DictionarySection[];
    raw?: unknown;
};

export type LookupOptions = {
    signal?: AbortSignal;
    timeoutMs?: number;
    userAgent?: string;
};
