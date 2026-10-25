// Builds dist/maze-tanks.html: one offline file with the shared modules inlined.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const scripts = ['shared/game.js', 'shared/render.js', 'shared/ui.js', 'local/local.js'].map(read).join('\n;\n');
const html = read('local/index.html')
  .replace('/*STYLE*/', () => read('shared/style.css'))
  .replace('/*SCRIPTS*/', () => scripts.replace(/<\/script/gi, '<\\/script'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/maze-tanks.html'), html);
console.log('dist/maze-tanks.html', (html.length / 1024).toFixed(1) + ' KB');
