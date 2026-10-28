import { fileURLToPath } from 'node:url';

/** Absolute path of the pipeline's fixtures directory (for tests). */
export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const HTTP_FIXTURES_DIR = fileURLToPath(new URL('../fixtures/http/', import.meta.url));
