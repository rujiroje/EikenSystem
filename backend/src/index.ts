import express from 'express';
import cors from 'cors';
import { router as authRouter } from './routes/auth';
import { router as productRouter } from './routes/products';
import { router as measurementRouter } from './routes/measurements';

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/products', productRouter);
app.use('/api/measurements', measurementRouter);

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
