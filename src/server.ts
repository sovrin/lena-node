import express from 'express';

import supportsRoutes from './routes/supports';
import translateRoutes from './routes/translate';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use('/translate', translateRoutes);
app.use('/supports', supportsRoutes);

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
