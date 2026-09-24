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

if (process.env.VERCEL_GIT_COMMIT_REF === 'codex/user-monitoring-stations') {
  console.log('\n[monitor-vercel-build] Deploying Convex backend for codex/user-monitoring-stations.');
  run('npx', ['convex', 'deploy']);
} else {
  console.log('\n[monitor-vercel-build] Skipping Convex deploy outside codex/user-monitoring-stations.');
}

console.log('\n[monitor-vercel-build] Build pipeline complete.');
