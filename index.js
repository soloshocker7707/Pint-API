import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import captureHandler from './api/v1/screenshot/capture.js';
import pdfHandler from './api/v1/screenshot/pdf.js';
import ogHandler from './api/v1/screenshot/og.js';
import healthHandler from './api/health.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('ZUPLO_SECRET loaded:', !!process.env.ZUPLO_SECRET);
console.log('DEBUG_PREVIEW status:', process.env.DEBUG_PREVIEW);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Set up routes to match Vercel functions
app.post('/api/v1/screenshot/capture', captureHandler);
app.post('/api/v1/screenshot/pdf', pdfHandler);
app.post('/api/v1/screenshot/og', ogHandler);
app.get('/api/health', healthHandler);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
