#!/usr/bin/env node
import {
  loadDeployEnv,
  readTextInput,
  resolveSecret,
} from './apex-deploy-lib.mjs';

async function main() {
  await loadDeployEnv();
  const inputPath = process.argv[2];
  const sqlText = await readTextInput(inputPath);
  const url = process.env.APEX_REST_SQL_URL;
  if (!url) {
    throw new Error('APEX_REST_SQL_URL is required. Copy .env.apex-deploy.example to .env.apex-deploy.');
  }

  const headers = {
    'Content-Type': 'application/sql',
  };

  const bearerToken = await resolveSecret('APEX_REST_SQL_BEARER_TOKEN', 'APEX_REST_SQL_BEARER_TOKEN_CMD');
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  } else {
    const user = process.env.APEX_REST_SQL_USER;
    const password = await resolveSecret('APEX_REST_SQL_PASSWORD', 'APEX_REST_SQL_PASSWORD_CMD');
    if (!user || !password) {
      throw new Error('REST SQL auth requires APEX_REST_SQL_USER plus APEX_REST_SQL_PASSWORD or APEX_REST_SQL_PASSWORD_CMD.');
    }
    headers.Authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: sqlText,
  });
  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = body;
  }

  console.log(JSON.stringify({
    ok: response.ok,
    status: response.status,
    url,
    response: parsed,
  }, null, 2));

  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
