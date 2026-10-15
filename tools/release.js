// 사용법: node tools/release.js "바뀐 내용 한 줄"  → gas/release.json 갱신
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const dir = path.join(__dirname, '..', 'gas');
const files = fs.readdirSync(dir).filter(f => /\.(gs|html)$/.test(f)).sort()
  .map(name => ({ name, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name), 'utf8'), 'utf8').digest('hex') }));
const d = new Date(Date.now() + 9 * 3600e3).toISOString();
const version = d.slice(0, 10).replace(/-/g, '') + '.' + d.slice(11, 16).replace(':', '');
fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({ version, note: process.argv[2] || '', files }, null, 2) + '\n');
console.log(version, files.map(f => f.name).join(', '));
