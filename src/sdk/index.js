// =============================================================
// vibexClient SDK — now the npm package @devvibex/sdk
// (source: github.com/METACREW-COMPANY/lh-vibex-frontend-sdk).
//
// Kept as a re-export because the platform still writes
// `src/api/vibexClient.js` with `import { createClient } from '@/sdk/index'`
// for every generated app. Do not add code here — change the SDK repo and
// bump the dependency instead.
// =============================================================
export { createClient } from '@devvibex/sdk';
