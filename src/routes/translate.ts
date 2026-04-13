import { Router } from 'express';

import type { ProviderName } from '../providers/factory';
import type { LanguagePair } from '../types';

import { createProvider } from '../providers/factory';

const router = Router();

const translate = async (
    providerName: ProviderName,
    query: string,
    from: string,
    to: string,
) => {
    const provider = createProvider(providerName);
    const pair = `${to}-${from}` as LanguagePair;

    return await provider.lookup(query, pair);
};

router.get('/:provider/:from-:to', async (req, res) => {
    const { provider, from, to } = req.params as {
        provider: ProviderName;
        from: string;
        to: string;
    };
    const { query } = req.query as {
        query: string;
    };

    const result = await translate(provider, query, from, to);

    res.json(result);
});

router.get('/:from-:to', async (req, res) => {
    const { from, to } = req.params as {
        from: string;
        to: string;
    };
    const { query } = req.query as {
        query: string;
    };

    const result = await translate('dictcc', query, from, to);

    res.json(result);
});
export default router;
