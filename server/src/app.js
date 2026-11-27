import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { buildRouter } from './api/routes.js';

/** Crea la aplicación Express (separada de listen() para poder probarla). */
export function createApp(store, passwords, distDir) {
  const app = express();
  app.use('/api', buildRouter(store, passwords));
  // En producción (npm run build) el backend también sirve el frontend compilado
  if (distDir && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  }
  return app;
}
