// أقساطي — a tiny in-memory stand-in for the MongoDB driver.
// It implements ONLY what lib/store.js and lib/auth.js use, with MongoDB's semantics for those calls:
//   db.collection(name) → findOne, find(filter).sort(spec).limit(n).toArray(), insertOne,
//   insertMany(docs, { ordered = true }) (duplicates → an error with code 11000 + writeErrors, like MongoBulkWriteError),
//   updateOne(filter, { $set, $setOnInsert, $inc, $unset }, { upsert }), updateMany, deleteOne, deleteMany,
//   findOneAndUpdate(filter, update, { upsert, returnDocument: 'before' | 'after' }) → the document or null,
//   countDocuments, createIndex(spec, { unique, expireAfterSeconds }).
// Filters: equality (null also matches a missing field) plus $in, $ne, $lt, $lte, $gt, $gte on a field.
// Duplicate _id or a value that breaks a unique index throws an Error with code 11000 (like E11000).
// TTL indexes are recorded but not enforced — the app always checks expiresAt in code anyway.
// Used by the tests and by local dev mode (`node server.mjs --memory` / AQSATI_MEMORY_DB=1).
import { randomUUID } from 'node:crypto';

const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const scalar = (v) => (v instanceof Date ? v.getTime() : v);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
const idKey = (id) => (id instanceof Date ? `date:${id.getTime()}` : `${typeof id}:${String(id)}`);

function same(a, b) {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  return a === b;
}

// MongoDB only compares values of the same kind (number with number, string with string, date with date).
function comparable(a, b) {
  if (a == null || b == null) return false;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date;
  return typeof a === typeof b && (typeof a === 'number' || typeof a === 'string');
}

function matchField(value, cond) {
  if (isPlainObject(cond)) {
    const ops = Object.keys(cond);
    if (!ops.length || !ops.every((k) => k.startsWith('$'))) {
      throw new Error('memorydb: object equality filters are not supported');
    }
    return ops.every((op) => {
      const arg = cond[op];
      switch (op) {
        case '$in':
          if (!Array.isArray(arg)) throw new Error('memorydb: $in needs an array');
          return arg.some((x) => (x === null ? value == null : same(value, x)));
        case '$ne':
          return arg === null ? value != null : !same(value, arg);
        case '$lt': return comparable(value, arg) && scalar(value) < scalar(arg);
        case '$lte': return comparable(value, arg) && scalar(value) <= scalar(arg);
        case '$gt': return comparable(value, arg) && scalar(value) > scalar(arg);
        case '$gte': return comparable(value, arg) && scalar(value) >= scalar(arg);
        default: throw new Error(`memorydb: unsupported filter operator ${op}`);
      }
    });
  }
  if (cond === null) return value == null;
  return same(value, cond);
}

function matches(doc, filter = {}) {
  if (!isPlainObject(filter)) throw new Error('memorydb: filter must be an object');
  return Object.entries(filter).every(([field, cond]) => {
    if (field.startsWith('$')) throw new Error(`memorydb: unsupported top-level operator ${field}`);
    return matchField(doc[field], cond);
  });
}

function compareValues(a, b) {
  if (same(a, b) || (a == null && b == null)) return 0;
  if (a == null) return -1; // missing/null sorts first, like MongoDB
  if (b == null) return 1;
  const x = scalar(a);
  const y = scalar(b);
  if (typeof x !== typeof y) return String(typeof x) < String(typeof y) ? -1 : 1;
  return x < y ? -1 : x > y ? 1 : 0;
}

const UPDATE_OPS = new Set(['$set', '$setOnInsert', '$inc', '$unset']);

function applyUpdate(doc, update, inserting) {
  if (!isPlainObject(update)) throw new Error('memorydb: update must be an object');
  const ops = Object.keys(update);
  if (!ops.length || !ops.every((op) => UPDATE_OPS.has(op))) {
    throw new Error(`memorydb: unsupported update (${ops.join(', ') || 'empty'})`);
  }
  if (update.$set) for (const [k, v] of Object.entries(update.$set)) doc[k] = clone(v);
  if (inserting && update.$setOnInsert) for (const [k, v] of Object.entries(update.$setOnInsert)) doc[k] = clone(v);
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) {
      if (typeof v !== 'number') throw new Error('memorydb: $inc needs a number');
      const cur = doc[k] ?? 0;
      if (typeof cur !== 'number') throw new Error('memorydb: $inc on a non-number field');
      doc[k] = cur + v;
    }
  }
  if (update.$unset) for (const k of Object.keys(update.$unset)) delete doc[k];
  return doc;
}

// The fields an upsert copies from its filter: plain equality conditions only.
function equalityFields(filter) {
  const out = {};
  for (const [k, v] of Object.entries(filter || {})) {
    if (!isPlainObject(v)) out[k] = clone(v);
  }
  return out;
}

const fingerprint = (doc) => JSON.stringify(doc);

function duplicateKeyError(collection, index) {
  const err = new Error(`E11000 duplicate key error collection: ${collection} index: ${index}`);
  err.name = 'MongoServerError';
  err.code = 11000;
  return err;
}

function createCollection(name) {
  const rows = new Map(); // idKey(_id) → document
  const uniques = []; // [{ name, fields: [...] }]
  const ttl = []; // recorded only

  const all = () => [...rows.values()];
  // Check the filter once up front, so an unsupported filter fails even on an empty collection.
  const select = (filter) => {
    matches({}, filter);
    return all().filter((d) => matches(d, filter));
  };
  const firstMatch = (filter) => select(filter)[0];

  // insertOne's work, done synchronously.
  function insertNow(input) {
    if (!isPlainObject(input)) throw new Error('memorydb: insert needs a document');
    const doc = clone(input);
    if (doc._id === undefined) doc._id = randomUUID();
    const key = idKey(doc._id);
    if (rows.has(key)) throw duplicateKeyError(name, '_id_');
    checkUnique(doc, key);
    rows.set(key, doc);
    return doc._id;
  }

  function checkUnique(doc, selfKey) {
    for (const idx of uniques) {
      const clash = all().some((other) => idKey(other._id) !== selfKey
        && idx.fields.every((f) => same(other[f] ?? null, doc[f] ?? null)));
      if (clash) throw duplicateKeyError(name, idx.name);
    }
  }

  // updateOne's work, done synchronously (no await between the read and the write).
  function updateOneNow(filter, update, options = {}) {
    const found = firstMatch(filter);
    if (found) {
      const key = idKey(found._id);
      const next = applyUpdate(clone(found), update, false);
      if (idKey(next._id) !== key) throw new Error('memorydb: _id is immutable');
      checkUnique(next, key);
      const modified = fingerprint(next) !== fingerprint(found);
      rows.set(key, next);
      return { acknowledged: true, matchedCount: 1, modifiedCount: modified ? 1 : 0, upsertedCount: 0, upsertedId: null };
    }
    if (options.upsert) {
      const doc = applyUpdate(equalityFields(filter), update, true);
      if (doc._id === undefined) doc._id = randomUUID();
      const key = idKey(doc._id);
      if (rows.has(key)) throw duplicateKeyError(name, '_id_');
      checkUnique(doc, key);
      rows.set(key, doc);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: doc._id };
    }
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
  }

  function cursor(list) {
    return {
      sort(spec = {}) {
        const keys = Object.entries(spec);
        list = [...list].sort((a, b) => {
          for (const [k, dir] of keys) {
            const c = compareValues(a[k], b[k]);
            if (c) return dir < 0 ? -c : c;
          }
          return 0;
        });
        return this;
      },
      limit(n) {
        if (n > 0) list = list.slice(0, n);
        return this;
      },
      async toArray() {
        return list.map(clone);
      },
    };
  }

  return {
    collectionName: name,

    async findOne(filter = {}) {
      return clone(firstMatch(filter)) ?? null;
    },

    find(filter = {}) {
      return cursor(select(filter));
    },

    async insertOne(input) {
      return { acknowledged: true, insertedId: insertNow(input) };
    },

    // Like the driver: ordered (default) stops at the first duplicate, { ordered: false } inserts every
    // other document. Either way a duplicate makes it throw ONE error (code 11000, writeErrors, insertedCount).
    async insertMany(inputs, options = {}) {
      if (!Array.isArray(inputs) || !inputs.length || !inputs.every(isPlainObject)) {
        throw new Error('memorydb: insertMany needs a non-empty array of documents');
      }
      const ordered = options.ordered !== false;
      const insertedIds = {};
      const writeErrors = [];
      for (let index = 0; index < inputs.length; index++) {
        if (ordered && writeErrors.length) break;
        try {
          insertedIds[index] = insertNow(inputs[index]);
        } catch (err) {
          if (err?.code !== 11000) throw err;
          writeErrors.push({ index, code: 11000, errmsg: err.message });
        }
      }
      const insertedCount = Object.keys(insertedIds).length;
      if (writeErrors.length) {
        const err = duplicateKeyError(name, 'bulk');
        err.name = 'MongoBulkWriteError';
        err.writeErrors = writeErrors;
        err.insertedCount = insertedCount;
        err.insertedIds = insertedIds;
        throw err;
      }
      return { acknowledged: true, insertedCount, insertedIds };
    },

    async updateOne(filter, update, options = {}) {
      return updateOneNow(filter, update, options);
    },

    // MongoDB driver v6 shape: resolves to the document itself (or null), not { value, ok }.
    // Runs in one synchronous step, so parallel callers each get their own result (like the server).
    async findOneAndUpdate(filter, update, options = {}) {
      const before = firstMatch(filter);
      if (!before && !options.upsert) return null;
      const r = updateOneNow(filter, update, { upsert: options.upsert });
      const id = before ? before._id : r.upsertedId;
      if (options.returnDocument === 'after') return clone(rows.get(idKey(id))) ?? null;
      return before ? clone(before) : null;
    },

    async updateMany(filter, update) {
      const targets = select(filter);
      // Validate everything first so a failing update changes nothing.
      const planned = targets.map((d) => {
        const key = idKey(d._id);
        const next = applyUpdate(clone(d), update, false);
        if (idKey(next._id) !== key) throw new Error('memorydb: _id is immutable');
        return { key, before: d, next };
      });
      for (const p of planned) checkUnique(p.next, p.key);
      let modifiedCount = 0;
      for (const p of planned) {
        if (fingerprint(p.next) !== fingerprint(p.before)) modifiedCount += 1;
        rows.set(p.key, p.next);
      }
      return { acknowledged: true, matchedCount: planned.length, modifiedCount, upsertedCount: 0, upsertedId: null };
    },

    async deleteOne(filter = {}) {
      const found = firstMatch(filter);
      if (!found) return { acknowledged: true, deletedCount: 0 };
      rows.delete(idKey(found._id));
      return { acknowledged: true, deletedCount: 1 };
    },

    async deleteMany(filter = {}) {
      const targets = select(filter);
      for (const d of targets) rows.delete(idKey(d._id));
      return { acknowledged: true, deletedCount: targets.length };
    },

    async countDocuments(filter = {}) {
      return select(filter).length;
    },

    async createIndex(spec, options = {}) {
      if (!isPlainObject(spec) || !Object.keys(spec).length) throw new Error('memorydb: bad index spec');
      const indexName = options.name || Object.entries(spec).map(([k, v]) => `${k}_${v}`).join('_');
      const fields = Object.keys(spec);
      if (options.unique && !uniques.some((u) => u.name === indexName)) {
        // Like MongoDB, refuse to build a unique index over data that already breaks it.
        const seen = new Set();
        for (const d of all()) {
          const k = JSON.stringify(fields.map((f) => scalar(d[f] ?? null)));
          if (seen.has(k)) throw duplicateKeyError(name, indexName);
          seen.add(k);
        }
        uniques.push({ name: indexName, fields });
      }
      if (options.expireAfterSeconds !== undefined && !ttl.some((t) => t.name === indexName)) {
        ttl.push({ name: indexName, fields, expireAfterSeconds: options.expireAfterSeconds });
      }
      return indexName;
    },
  };
}

/** A fresh, empty in-memory database: `createMemoryDb().collection('installments')`. */
export function createMemoryDb() {
  const collections = new Map();
  return {
    memory: true,
    collection(name) {
      if (typeof name !== 'string' || !name) throw new Error('memorydb: collection name required');
      if (!collections.has(name)) collections.set(name, createCollection(name));
      return collections.get(name);
    },
  };
}
