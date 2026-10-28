#!/usr/bin/env node
/**
 * CI entry: compute and optionally write next semver (stdout JSON).
 * Usage: node run-auto-version-bump.mjs [--write] [--explicit=1.2.3] [--level=patch|minor|major]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveNextVersion,
  writePackageVersion,
} from "./auto-version-bump-lib.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const args = process.argv.slice(2);
const write = args.includes("--write");
const explicitArg = args.find((a) => a.startsWith("--explicit="));
const levelArg = args.find((a) => a.startsWith("--level="));
const explicitVersion = explicitArg ? explicitArg.split("=")[1] : "";
const bumpLevel = levelArg ? levelArg.split("=")[1] : "patch";

const npmPkg = "@workers-world/framework_sdk_cli";
let publishedVersion = null;
// explicit version does not need registry; skip npm view so --write --explicit
// (Push step) does not depend on NODE_AUTH_TOKEN.
if (!explicitVersion) {
  const view = spawnSync(
    "npm",
    ["view", `${npmPkg}@latest`, "version", "--registry=https://npm.pkg.github.com"],
    { encoding: "utf8", env: { ...process.env, NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN ?? "" } },
  );
  if (view.status === 0) {
    publishedVersion = view.stdout.trim();
  } else if (!/404|E404|not found|No match found/i.test(`${view.stderr}${view.stdout}`)) {
    console.error(view.stderr || view.stdout);
    process.exit(1);
  }
}

const { next, reason } = resolveNextVersion({
  packageVersion: pkg.version,
  publishedVersion,
  explicitVersion: explicitVersion || undefined,
  bumpLevel: /** @type {"patch"|"minor"|"major"} */ (bumpLevel),
});

const out = { next, reason, packageVersion: pkg.version, publishedVersion };
if (next && write) {
  writePackageVersion(pkgPath, next);
}
console.log(JSON.stringify(out));
