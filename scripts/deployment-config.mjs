import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync(new URL('../deploy/targets.json', import.meta.url), 'utf8'));
const values = { PUBLIC_URL: config.publicUrl, DEPLOY_TARGET: config.sshTarget, DEPLOY_PORT: config.sshPort, CENTER_RUNNER: config.runner };
for (const [key, value] of Object.entries(values)) {
  if (/[\r\n]/.test(String(value))) throw new Error(`Invalid deployment configuration: ${key}`);
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `public_url=${config.publicUrl}\n`);
