import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { validateLocalConfig } from '@londi-agent-os/contracts';

export function ensureApprovedDataDirectories(config) {
  validateLocalConfig(config);

  const directories = new Set([
    config.dataRoot,
    config.paths.runs,
    config.paths.worktrees,
    config.paths.backups,
    config.paths.obsidianSnapshots,
    dirname(config.paths.database)
  ]);

  for (const directory of directories) mkdirSync(directory, { recursive: true });
  return [...directories].sort();
}
