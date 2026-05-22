import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

export async function loadDeployEnv() {
  const envFile = process.env.APEX_DEPLOY_ENV_FILE || '.env.apex-deploy';
  try {
    const text = await readFile(envFile, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
        continue;
      }
      const index = trimmed.indexOf('=');
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
        continue;
      }
      process.env[key] = stripQuotes(rawValue);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export async function readTextInput(inputPath) {
  if (!inputPath) {
    throw new Error('Missing input file. Pass a file path or - for stdin.');
  }
  if (inputPath === '-') {
    return new Promise((resolve, reject) => {
      let text = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        text += chunk;
      });
      process.stdin.on('end', () => resolve(text));
      process.stdin.on('error', reject);
    });
  }
  return readFile(inputPath, 'utf8');
}

export async function resolveSecret(valueName, commandName) {
  if (process.env[valueName]) {
    return process.env[valueName];
  }
  if (!process.env[commandName]) {
    return '';
  }
  return runShellCapture(process.env[commandName]);
}

async function runShellCapture(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Secret command failed with ${code}: ${stderr.trim()}`));
      }
    });
  });
}

export async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio || 'inherit',
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
    });
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
