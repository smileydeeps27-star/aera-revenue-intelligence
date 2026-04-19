const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Temp data dir — leave real data/ untouched
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-seed-'));
process.env.RI_DATA_DIR = TMP;

const load = require('../load-seed');

function hashDir(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update(fs.readFileSync(path.join(dir, f)));
  }
  return h.digest('hex');
}

(async () => {
  await load();
  const h1 = hashDir(TMP);
  // Wipe + reseed
  for (const f of fs.readdirSync(TMP)) fs.unlinkSync(path.join(TMP, f));
  await load();
  const h2 = hashDir(TMP);

  // Cleanup
  for (const f of fs.readdirSync(TMP)) fs.unlinkSync(path.join(TMP, f));
  fs.rmdirSync(TMP);

  if (h1 === h2) {
    console.log('ok   seed idempotency — ' + h1.slice(0, 16));
    process.exit(0);
  } else {
    console.error('FAIL seed idempotency: ' + h1.slice(0, 16) + ' !== ' + h2.slice(0, 16));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
