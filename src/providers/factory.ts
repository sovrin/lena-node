import type { DictionaryProvider } from './index';

import { DictCcProvider } from './dictcc';
import { LeoProvider } from './leo';

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
