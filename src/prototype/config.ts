/**
 * Prototype switch. `VITE_DATA_SOURCE=mock` is set only by `.env.development` (pnpm dev) and
 * `.env.prototype` (pnpm build:prototype). A normal production build has no data source and
 * stays deny-by-default: no sample data, no prototype sign-in.
 */
export const PROTOTYPE_MODE = import.meta.env.VITE_DATA_SOURCE === 'mock';
