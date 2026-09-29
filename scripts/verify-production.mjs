import fs from 'node:fs';
import { createClient, verifyAssets, verifyCatalog } from './publish-riversoft.mjs';
import configuration from '../deploy/targets.json' with { type: 'json' };

const publication = JSON.parse(fs.readFileSync('artifacts/platform-publication.json', 'utf8'));
if (publication.stage !== 'catalog-verified' || publication.revision !== process.env.GITHUB_SHA
  || publication.url !== process.env.PUBLIC_URL) throw new Error('Missing matching platform publication result.');
const files = await verifyAssets({ directory: process.env.RELEASE_DIRECTORY, revision: publication.revision, url: publication.url });
await verifyCatalog(createClient({ base: configuration.platformUrl, token: process.env.RIVERSOFT_TOKEN }), configuration, publication);
console.log(`Platform release ${publication.revision}: all ${files} files match SHA-256 and the homepage catalog matches.`);
