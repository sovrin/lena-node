import { Router } from 'express';

import { DictCcProvider } from '../providers/dictcc';
import { LeoProvider } from '../providers/leo';

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
