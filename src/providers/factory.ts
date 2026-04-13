import type { DictionaryProvider } from './index';

import { LeoProvider, DictCcProvider } from './adapters';

export type ProviderName = 'leo' | 'dictcc';

export function createProvider(name: ProviderName): DictionaryProvider {
    switch (name) {
        case 'leo':
            return new LeoProvider();
        case 'dictcc':
            return new DictCcProvider();
        default: {
            throw new Error(`Unsupported provider: ${name}`);
        }
    }
}
