#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const sourceDir = process.argv[2] || 'apex/apps/f56594';
const outputZip = process.argv[3] || 'apex/build/f56594-apexlang.zip';

function usage() {
  console.error(`Usage:
  node scripts/apex-package-apexlang.mjs [source_dir] [output_zip]

Defaults:
  source_dir: apex/apps/f56594
  output_zip: apex/build/f56594-apexlang.zip`);
}

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
  });
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const absoluteSourceDir = path.resolve(sourceDir);
  const absoluteOutputZip = path.resolve(outputZip);
  await mkdir(path.dirname(absoluteOutputZip), { recursive: true });
  await rm(absoluteOutputZip, { force: true });
  await runCommand('zip', ['-qr', absoluteOutputZip, '.'], { cwd: absoluteSourceDir });

  console.log(JSON.stringify({
    ok: true,
    sourceDir: absoluteSourceDir,
    outputZip: absoluteOutputZip,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
