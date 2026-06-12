// __mocks__/wx-server-sdk.js
// In-memory mock for WeChat cloud SDK

const store = {};
const createdCollections = new Set();
let _openid = "test-openid-001";
let autoId = 1;

function resetStore() {
  for (const key of Object.keys(store)) delete store[key];
  createdCollections.clear();
  autoId = 1;
}

function setOpenid(id) {
  _openid = id;
}

function getCollectionData(name) {
  if (!store[name]) store[name] = [];
  return store[name];
}

// ---- command helpers ----
class Sentinel {
  constructor(type, value) { this.type = type; this.value = value; }
}
function inOp(arr)        { return new Sentinel("in", arr); }
function neqOp(v)         { return new Sentinel("neq", v); }
function gtOp(v)          { return new Sentinel("gt", v); }
function gteOp(v)         { return new Sentinel("gte", v); }
function lteOp(v)         { return new Sentinel("lte", v); }
function andOp(...args)   { return new Sentinel("and", args); }

function matchValue(fieldVal, op) {
  if (!(op instanceof Sentinel)) return fieldVal === op;
  switch (op.type) {
    case "in":  return op.value.includes(fieldVal);
    case "neq": return fieldVal !== op.value;
    case "gt":  return fieldVal > op.value;
    case "gte": return fieldVal >= op.value;
    case "lte": return fieldVal <= op.value;
    case "and": return op.value.every(sub => matchValue(fieldVal, sub));
    default: return true;
  }
}

function matchDoc(doc, whereClause) {
  if (!whereClause) return true;
  return Object.entries(whereClause).every(([key, expected]) => {
    const val = doc[key];
    if (expected && expected.type === "RegExp") {
      const re = new RegExp(expected.regexp, expected.options || "");
      return re.test(String(val || ""));
    }
    return matchValue(val, expected);
  });
}

function nextId() { return "mock-id-" + (autoId++); }

class QueryBuilder {
  constructor(colName) {
    this.colName = colName;
    this._where = null;
    this._orderBy = null;
    this._skip = 0;
    this._limit = 100;
    this._docId = null;
  }

  where(q) { this._where = q; return this; }
  orderBy(field, dir) { this._orderBy = { field, dir }; return this; }
  skip(n) { this._skip = n; return this; }
  limit(n) { this._limit = n; return this; }

  async get() {
    if (this._docId) {
      const col = getCollectionData(this.colName);
      const found = col.find(d => d._id === this._docId);
      if (!found) {
        const err = new Error("not found");
        err.errCode = -1;
        throw err;
      }
      return { data: JSON.parse(JSON.stringify(found)) };
    }
    let data = getCollectionData(this.colName).filter(d => matchDoc(d, this._where));
    if (this._orderBy) {
      const { field, dir } = this._orderBy;
      data.sort((a, b) => {
        const va = a[field], vb = b[field];
        if (va < vb) return dir === "asc" ? -1 : 1;
        if (va > vb) return dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    data = data.slice(this._skip, this._skip + this._limit);
    return { data: data.map(d => JSON.parse(JSON.stringify(d))) };
  }

  async add({ data }) {
    const id = nextId();
    const record = Object.assign({}, JSON.parse(JSON.stringify(data)), { _id: id });
    getCollectionData(this.colName).push(record);
    return { _id: id };
  }

  async update({ data }) {
    if (!this._docId) throw new Error("update requires doc()");
    const col = getCollectionData(this.colName);
    const idx = col.findIndex(d => d._id === this._docId);
    if (idx === -1) throw new Error("not found");
    Object.assign(col[idx], JSON.parse(JSON.stringify(data)));
    return { updated: 1, stats: { updated: 1 } };
  }

  doc(id) {
    this._docId = id;
    return this;
  }

  async count() {
    const data = getCollectionData(this.colName).filter(d => matchDoc(d, this._where));
    return { total: data.length };
  }
}

// Transaction mock — operates directly on the shared store
class TransactionQueryBuilder {
  constructor(colName) {
    this.colName = colName;
    this._docId = null;
  }
  doc(id) { this._docId = id; return this; }
  async get() {
    if (this._docId) {
      const col = getCollectionData(this.colName);
      const found = col.find(d => d._id === this._docId);
      if (!found) { const e = new Error("not found"); e.errCode = -1; throw e; }
      return { data: JSON.parse(JSON.stringify(found)) };
    }
    return { data: [] };
  }
  async add({ data }) {
    const id = nextId();
    const record = Object.assign({}, JSON.parse(JSON.stringify(data)), { _id: id });
    getCollectionData(this.colName).push(record);
    return { _id: id };
  }
  async update({ data }) {
    if (!this._docId) throw new Error("update requires doc()");
    const col = getCollectionData(this.colName);
    const idx = col.findIndex(d => d._id === this._docId);
    if (idx === -1) throw new Error("not found");
    Object.assign(col[idx], JSON.parse(JSON.stringify(data)));
    return { updated: 1 };
  }
}

// ---- cloud object ----
const cloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: "test-env",
  getWXContext() { return { OPENID: _openid }; },
  async getTempFileURL({ fileList }) {
    return {
      fileList: fileList.map(id => ({
        fileID: id,
        tempFileURL: "https://tmp/" + id.split("/").pop()
      }))
    };
  },
  database() {
    const dbObj = {
      collection(name) { return new QueryBuilder(name); },
      command: {
        in: inOp, neq: neqOp, gt: gtOp, gte: gteOp, lte: lteOp, and: andOp
      },
      RegExp({ regexp, options }) {
        return { type: "RegExp", regexp, options };
      },
      async createCollection(name) {
        if (createdCollections.has(name)) {
          const err = new Error("Collection already exists");
          err.errMsg = "Collection already exists";
          throw err;
        }
        createdCollections.add(name);
        getCollectionData(name);
        return {};
      },
      async runTransaction(callback) {
        // Simple mock: provide a transaction object that operates on the shared store
        const transaction = {
          collection(name) { return new TransactionQueryBuilder(name); }
        };
        return callback(transaction);
      }
    };
    return dbObj;
  }
};

module.exports = cloud;
module.exports.__test = { resetStore, setOpenid, getCollectionData, store, createdCollections };
