const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DATA_DIR = process.env.RI_DATA_DIR
  ? path.resolve(process.env.RI_DATA_DIR)
  : path.join(__dirname, '..', 'data');

const locks = new Map();

async function withLock(file, fn) {
  const prev = locks.get(file) || Promise.resolve();
  let release;
  const next = new Promise(r => { release = r; });
  locks.set(file, prev.then(() => next));
  await prev;
  try { return await fn(); } finally { release(); if (locks.get(file) === next) locks.delete(file); }
}

function filePath(collection) {
  return path.join(DATA_DIR, collection + '.json');
}

async function ensureDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

async function readAll(collection) {
  await ensureDir();
  const p = filePath(collection);
  try {
    const raw = await fsp.readFile(p, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeAll(collection, rows) {
  await ensureDir();
  const p = filePath(collection);
  await withLock(p, async () => {
    await fsp.writeFile(p, JSON.stringify(rows, null, 2));
  });
  return rows;
}

async function readOne(collection, id, idField = 'id') {
  const rows = await readAll(collection);
  return rows.find(r => r[idField] === id) || null;
}

async function upsert(collection, row, idField = 'id') {
  const rows = await readAll(collection);
  const idx = rows.findIndex(r => r[idField] === row[idField]);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
  else rows.push(row);
  await writeAll(collection, rows);
  return row;
}

async function remove(collection, id, idField = 'id') {
  const rows = await readAll(collection);
  const next = rows.filter(r => r[idField] !== id);
  await writeAll(collection, next);
  return { removed: rows.length - next.length };
}

async function append(collection, row) {
  const rows = await readAll(collection);
  rows.push(row);
  await writeAll(collection, rows);
  return row;
}

module.exports = { DATA_DIR, readAll, writeAll, readOne, upsert, remove, append };
