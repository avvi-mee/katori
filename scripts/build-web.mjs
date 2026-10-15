// Production web build: Metro export with tree shaking, then the Workbox service worker.
// (Env is set here so it works the same on Windows and in CI.)
import { spawnSync } from 'node:child_process';

const env = { ...process.env, EXPO_UNSTABLE_TREE_SHAKING: '1', EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: '1' };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npx', ['expo', 'export', '--platform', 'web', ...process.argv.slice(2)]);
run('node', ['scripts/build-sw.mjs']);
