export const MIGRATIONS_PACKAGE = '@londi-agent-os/migrations';
export const INITIAL_SCHEMA_VERSION = 0;
if (process.argv.includes('--build-check')) console.log(`${MIGRATIONS_PACKAGE} build OK`);
