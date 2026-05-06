import 'reflect-metadata';
import { createServer } from './server';
import { studioConfig } from './config';
import { startCatalogSyncScheduler } from './services/catalog-sync.scheduler';

const app = createServer();

app.listen(studioConfig.port, () => {
  // eslint-disable-next-line no-console
  console.log(`OpenClaw Studio API listening on ${studioConfig.port}`);

  // Arrancar el scheduler de sync del catálogo LLM (cada 6 h + warm-up 30s)
  startCatalogSyncScheduler();
});
