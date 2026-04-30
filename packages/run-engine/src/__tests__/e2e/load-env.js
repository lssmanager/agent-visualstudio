/**
 * load-env.js — setupFile para Jest E2E.
 * Carga .env.e2e (si existe) ANTES de que los tests importen módulos.
 * Usa override:false para no pisar vars ya definidas en el entorno del CI.
 */
const { config } = require('dotenv');
const { resolve } = require('node:path');

config({
  path: resolve(__dirname, '.env.e2e'),
  override: false,
});
