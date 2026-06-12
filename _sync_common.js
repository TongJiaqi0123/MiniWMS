// Sync _shared/common.js to all cloud function directories.
// Run: node _sync_common.js
const fs = require("fs");
const path = require("path");

const shared = path.join(__dirname, "cloudfunctions", "_shared", "common.js");
const cloudRoot = path.join(__dirname, "cloudfunctions");
const src = fs.readFileSync(shared, "utf8");

const dirs = fs.readdirSync(cloudRoot).filter((d) => {
  const full = path.join(cloudRoot, d);
  return fs.statSync(full).isDirectory() && d !== "_shared";
});

let count = 0;
for (const dir of dirs) {
  const dest = path.join(cloudRoot, dir, "common.js");
  const existing = fs.readFileSync(dest, "utf8");
  if (existing !== src) {
    fs.writeFileSync(dest, src, "utf8");
    count++;
    console.log("synced:", dir);
  }
}
console.log("Done. Updated " + count + " of " + dirs.length + " functions.");
