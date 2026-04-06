import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgPath = path.resolve(__dirname, '../package.json');
const swPath = path.resolve(__dirname, '../public/sw.js');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

let swContent = fs.readFileSync(swPath, 'utf8');

// Replace CACHE_NAME value
const newSwContent = swContent.replace(
  /const\s+CACHE_NAME\s+=\s+['"]pretext-v[\d\.]+['"];/,
  `const CACHE_NAME = 'pretext-v${version}';`
);

if (swContent !== newSwContent) {
  fs.writeFileSync(swPath, newSwContent);
  console.log(`Successfully synced sw.js cache name to v${version}`);
} else {
  console.log('sw.js cache name already in sync');
}
