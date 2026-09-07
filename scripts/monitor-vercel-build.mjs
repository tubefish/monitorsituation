import { spawnSync } from 'node:child_process';

function run(command, args) {
  console.log(`\n[monitor-vercel-build] $ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'security:vite-env-secrets', '--', '--strict-local']);
run('npx', ['tsc', '--noEmit', '--noUnusedLocals', 'false']);
run('node', ['scripts/monitor-vite-prebuild.mjs']);
run('npx', ['cross-env', 'VITE_VARIANT=full', 'vite', 'build']);
run('node', ['scripts/monitor-postbuild.mjs']);
run('node', ['scripts/monitor-prune-vercel-api.mjs']);

console.log('\n[monitor-vercel-build] Build pipeline complete.');
