// Builds one self-contained HTML body for the shareable claude.ai preview: inlines the CSS and JS
// emitted by `vite build --mode artifact` (fonts and images are already data: URIs).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-artifact';
const out = process.argv[2] ?? join(dir, 'aenix-prototype.html');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\/([^"]+)"[^>]*>/g)].map((m) =>
  readFileSync(join(dir, m[1]), 'utf8'),
);
const js = [...html.matchAll(/<script type="module"[^>]*src="\/([^"]+)"[^>]*><\/script>/g)].map((m) =>
  readFileSync(join(dir, m[1]), 'utf8'),
);
if (!css.length || !js.length) throw new Error('expected one stylesheet and one module script');
const page = `<title>AENIX ERP Prototype</title>
<meta name="robots" content="noindex, nofollow">
<style>${css.join('\n')}
body{margin:0;background:var(--color-canvas);color:var(--color-fg);font-family:var(--font-sans);font-size:16px}</style>
<div id="root"></div>
<script type="module">${js.join('\n').replace(/<\/script/gi, '<\\/script')}</script>
`;
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024 / 1024).toFixed(2)} MB`);

// Standalone copy with its own document shell, for static hosting (GitHub Pages / CI download).
const standalone = `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${page}</head>
</html>
`
  .replace('<div id="root"></div>', '</head><body><div id="root"></div>')
  .replace(/<\/head>\n<\/html>\n$/, '</body>\n</html>\n');
const standaloneOut = join(dir, 'site', 'index.html');
mkdirSync(join(dir, 'site'), { recursive: true });
writeFileSync(standaloneOut, standalone);
console.log(`${standaloneOut}: standalone page`);
