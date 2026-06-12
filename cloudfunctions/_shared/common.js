const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const COLLECTIONS = [
  "tenants",
  "tenant_members",
  "join_requests",
  "inbound_records",
  "stock_movements",
  "system_config"
];

function ok(data = {}) {
  return { ok: true, data };
}

function fail(message, code = "BAD_REQUEST") {
  return { ok: false, code, message };
}

function now() {
  return new Date();
}

function round(value, digits = 6) {
  const num = Number(value || 0);
  return Number(num.toFixed(digits));
}

function pieceArea(record) {
  return round(Number(record.lengthCm || 0) * Number(record.widthCm || 0) / 10000);
}

function piecesFromArea(area, record) {
  const areaPerPiece = pieceArea(record);
  if (areaPerPiece <= 0) return 0;
  return Math.floor(Number(area || 0) / areaPerPiece);
}

async function resolveImages(record) {
  if (!record.images || !record.images.length) return record;
  var result = Object.assign({}, record);
  result.images = record.images.slice();
  var ids = [];
  for (var i = 0; i < result.images.length; i++) {
    var s = result.images[i];
    if (typeof s === "string" && s.indexOf("cloud://") === 0) ids.push(s);
  }
  if (!ids.length) return result;
  try {
    var res = await cloud.getTempFileURL({ fileList: ids });
    var map = {};
    for (var j = 0; j < (res.fileList || []).length; j++) {
      var f = res.fileList[j];
      map[f.fileID] = f.tempFileURL;
    }
    for (var k = 0; k < result.images.length; k++) {
      if (map[result.images[k]]) result.images[k] = map[result.images[k]];
    }
  } catch (e) {}
  return result;
}

async function ensureCollections() {
  await Promise.all(COLLECTIONS.map(async (name) => {
    try {
      await db.createCollection(name);
    } catch (error) {
      const message = String(error && (error.errMsg || error.message || error));
      if (!message.includes("already exists") && !message.includes("collection exists") && !message.includes("ResourceExist") && !message.includes("Table exist") && !message.includes("-502004")) {
        throw error;
      }
    }
  }));
}

async function getOpenid() {
  const wxContext = cloud.getWXContext();
  return wxContext.OPENID;
}

async function isSystemAdmin(openid) {
  try {
    const configRes = await db.collection("system_config").limit(10).get();
    return (configRes.data || []).some((cfg) => Array.isArray(cfg.adminOpenids) && cfg.adminOpenids.includes(openid));
  } catch (e) {
    return false;
  }
}

async function requireTenantAccess(tenantId, roles) {
  const openid = await getOpenid();
  if (!tenantId) {
    throw new Error("缺少仓库空间");
  }

  const tenantRes = await db.collection("tenants").doc(tenantId).get();
  const tenant = tenantRes.data;
  if (!tenant || tenant.status === "rejected") {
    throw new Error("该仓库不可用");
  }

  const adminOpenid = await isSystemAdmin(openid);
  if (tenant.accessStatus === "disabled" && !adminOpenid) {
    throw new Error("仓库已禁用，暂不可进入");
  }

  const res = await db.collection("tenant_members")
    .where({ tenantId, openid, status: "active" })
    .limit(1)
    .get();

  const member = res.data[0];
  if (!member && !adminOpenid) {
    throw new Error("无权访问该仓库");
  }

  if (!adminOpenid) {
    const effectiveRole = member && member.role;
    if (roles && roles.length && (!effectiveRole || !roles.includes(effectiveRole))) {
      throw new Error("当前角色无权操作");
    }
  }

  return { openid, member, tenant, isSystemAdmin: adminOpenid };
}

async function requireMember(tenantId, roles) {
  const result = await requireTenantAccess(tenantId, roles);
  return result;
}

async function getTenantNameMap(tenantIds) {
  if (!tenantIds.length) return {};
  const res = await db.collection("tenants")
    .where({ _id: _.in(tenantIds) })
    .get();
  return res.data.reduce((map, item) => {
    map[item._id] = item.name;
    return map;
  }, {});
}

async function getTenantDetailMap(tenantIds) {
  if (!tenantIds.length) return {};
  const res = await db.collection("tenants")
    .where({ _id: _.in(tenantIds) })
    .get();
  return res.data.reduce((map, item) => {
    map[item._id] = item;
    return map;
  }, {});
}

function inviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

module.exports = {
  cloud,
  db,
  _,
  ok,
  fail,
  now,
  round,
  pieceArea,
  piecesFromArea,
  resolveImages,
  ensureCollections,
  getOpenid,
  requireMember,
  requireTenantAccess,
  isSystemAdmin,
  getTenantNameMap,
  getTenantDetailMap,
  inviteCode
};
