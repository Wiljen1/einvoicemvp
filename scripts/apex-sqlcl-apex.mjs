#!/usr/bin/env node
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  loadDeployEnv,
  resolveSecret,
  runCommand,
} from './apex-deploy-lib.mjs';

function usage() {
  console.error(`Usage:
  node scripts/apex-sqlcl-apex.mjs list
  node scripts/apex-sqlcl-apex.mjs validate [source_dir]
  node scripts/apex-sqlcl-apex.mjs import [source_dir]
  node scripts/apex-sqlcl-apex.mjs export [application_id] [output_dir]

Requires a direct SQLcl database connection in .env.apex-deploy:
  APEX_SQLCL_CONNECT
  APEX_SQLCL_USER
  APEX_SQLCL_PASSWORD or APEX_SQLCL_PASSWORD_CMD`);
}

function quoteSqlclString(value) {
  return String(value).replace(/"/g, '""');
}

async function createSqlclScript(commandText) {
  const dir = await mkdir(path.join(os.tmpdir(), `apex-sqlcl-${Date.now()}`), { recursive: true });
  const file = path.join(dir, 'run.sql');
  const user = process.env.APEX_SQLCL_USER;
  const connect = process.env.APEX_SQLCL_CONNECT;
  const password = await resolveSecret('APEX_SQLCL_PASSWORD', 'APEX_SQLCL_PASSWORD_CMD');
  if (!user || !connect || !password) {
    throw new Error('SQLcl deployment requires APEX_SQLCL_USER, APEX_SQLCL_CONNECT, and APEX_SQLCL_PASSWORD or APEX_SQLCL_PASSWORD_CMD.');
  }

  await writeFile(file, [
    'set echo off',
    'set define off',
    `connect ${user}/"${quoteSqlclString(password)}"@${connect}`,
    commandText,
    'exit',
    '',
  ].join('\n'), 'utf8');
  return { dir, file };
}

async function runSqlcl(commandText) {
  const sqlcl = process.env.APEX_SQLCL_BIN || 'sql';
  const { dir, file } = await createSqlclScript(commandText);
  try {
    await runCommand(sqlcl, ['-L', '-S', '/nolog', `@${file}`], {
      env: {
        JAVA_HOME: process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21',
        PATH: `${process.env.APEX_SQLCL_BIN_DIR || `${process.env.HOME || ""}/sqlcl/sqlcl/bin`}:/opt/homebrew/opt/openjdk@21/bin:${process.env.PATH}`,
      },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  await loadDeployEnv();
  const [command, arg1, arg2] = process.argv.slice(2);
  const workspace = process.env.APEX_WORKSPACE || 'EMEAWJ';
  const appId = arg1 || process.env.APEX_APP_ID || '56594';
  const sourceDir = arg1 || process.env.APEX_APP_SOURCE_DIR || 'apex/apps/f56594';

  if (!command || command === '--help' || command === 'help') {
    usage();
    return;
  }

  if (command === 'list') {
    await runSqlcl('apex list');
    return;
  }

  if (command === 'validate') {
    await runSqlcl(`apex validate -input ${sourceDir} -workspace ${workspace}`);
    return;
  }

  if (command === 'import') {
    await runSqlcl(`apex import -input ${sourceDir} -workspace ${workspace}`);
    return;
  }

  if (command === 'export') {
    const outputDir = arg2 || process.env.APEX_APP_SOURCE_DIR || `apex/apps/f${appId}`;
    await runSqlcl(`apex export-application -applicationid ${appId} -exptype APEXLANG -split -force -dir ${outputDir}`);
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
