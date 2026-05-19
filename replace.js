const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'app');

const replacements = [
  { search: /#0d9488/g, replace: '#ea580c' }, // teal-600 -> orange-600
  { search: /#14b8a6/g, replace: '#f97316' }, // teal-500 -> orange-500
  { search: /#f0fdfa/g, replace: '#fff7ed' }, // teal-50 -> orange-50
  { search: /#ccfbf1/g, replace: '#ffedd5' }, // teal-100 -> orange-100
  { search: /#0f766e/g, replace: '#c2410c' }, // teal-700 -> orange-700
  { search: /#115e59/g, replace: '#9a3412' }, // teal-800 -> orange-800
  { search: /text-teal-600/g, replace: 'text-orange-600' },
  { search: /text-teal-500/g, replace: 'text-orange-500' },
  { search: /text-teal-700/g, replace: 'text-orange-700' },
  { search: /bg-teal-500/g, replace: 'bg-orange-500' },
  { search: /bg-teal-600/g, replace: 'bg-orange-600' },
  { search: /bg-teal-50/g, replace: 'bg-orange-50' },
  { search: /bg-teal-100/g, replace: 'bg-orange-100' },
  { search: /border-teal-200/g, replace: 'border-orange-200' },
  { search: /border-teal-500/g, replace: 'border-orange-500' },
  { search: /ring-teal-500/g, replace: 'ring-orange-500' },
  { search: /ring-teal-200/g, replace: 'ring-orange-200' },
  { search: /hover:text-teal-700/g, replace: 'hover:text-orange-700' },
  { search: /hover:bg-teal-600/g, replace: 'hover:bg-orange-600' },
  { search: /hover:bg-teal-50/g, replace: 'hover:bg-orange-50' },
  { search: /focus:ring-teal-500/g, replace: 'focus:ring-orange-500' }
];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      for (const rule of replacements) {
        if (rule.search.test(content)) {
          content = content.replace(rule.search, rule.replace);
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

processDirectory(targetDir);
console.log('Global replacement completed.');
