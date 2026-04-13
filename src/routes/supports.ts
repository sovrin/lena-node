import { Router } from 'express';

import { DictCcProvider, LeoProvider } from '../providers/adapters';

const router = Router();

const PROVIDERS = [new LeoProvider(), new DictCcProvider()];

router.get('/', (_req, res) => {
    res.json(
        PROVIDERS.map((p) => ({
            name: p.name,
            languagePairs: p.languagePairs,
        })),
    );
});

export default router;
