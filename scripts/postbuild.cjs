const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const directory = path.join(root, "dist/.well-known");
fs.mkdirSync(directory, { recursive: true });
fs.copyFileSync(path.join(root, "public/.well-known/assetlinks.json"), path.join(directory, "assetlinks.json"));
const links = JSON.parse(fs.readFileSync(path.join(directory, "assetlinks.json"), "utf8"));
if (!links[0]?.target?.sha256_cert_fingerprints?.length) throw new Error("Vínculo Android ausente no pacote web.");
console.log("App Links: assetlinks.json incluído e validado.");
