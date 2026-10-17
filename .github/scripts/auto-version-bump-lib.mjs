#!/usr/bin/env node
/**
 * Semver bump helpers for auto-version-bump workflow (mirrors worker-actions release-actions-bundle gate/bump semantics).
 */
import fs from "node:fs";

export const SKIP_VERSION_BUMP_MARKER = "[skip version-bump]";

/** @param {string} subject First line of commit message (PR squash title). */
export function shouldSkipVersionBump(subject) {
  return subject.includes(SKIP_VERSION_BUMP_MARKER);
}

/** @param {string} version */
export function parseSemver(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!m) {
    throw new Error(`version must be X.Y.Z, got: ${version}`);
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/**
 * @param {string} version
 * @param {"patch"|"minor"|"major"} level
 */
export function bumpSemver(version, level = "patch") {
  const { major, minor, patch } = parseSemver(version);
  if (level === "major") {
    return `${major + 1}.0.0`;
  }
  if (level === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * @returns {-1|0|1}
 */
export function compareSemver(a, b) {
  const aa = parseSemver(a);
  const bb = parseSemver(b);
  if (aa.major !== bb.major) return aa.major > bb.major ? 1 : -1;
  if (aa.minor !== bb.minor) return aa.minor > bb.minor ? 1 : -1;
  if (aa.patch !== bb.patch) return aa.patch > bb.patch ? 1 : -1;
  return 0;
}

/**
 * Decide next version for auto-bump.
 * @param {{
 *   packageVersion: string;
 *   publishedVersion: string | null;
 *   explicitVersion?: string;
 *   bumpLevel?: "patch"|"minor"|"major";
 * }} opts
 * @returns {{ next: string | null; reason: string }}
 */
export function resolveNextVersion(opts) {
  const {
    packageVersion,
    publishedVersion,
    explicitVersion,
    bumpLevel = "patch",
  } = opts;

  if (explicitVersion) {
    parseSemver(explicitVersion);
    return { next: explicitVersion, reason: "workflow_dispatch explicit version" };
  }

  parseSemver(packageVersion);

  if (publishedVersion != null) {
    parseSemver(publishedVersion);
    if (compareSemver(packageVersion, publishedVersion) > 0) {
      return {
        next: null,
        reason: `package.json ${packageVersion} already ahead of published ${publishedVersion}`,
      };
    }
  }

  const base = packageVersion;
  const next = bumpSemver(base, bumpLevel);
  return { next, reason: `auto ${bumpLevel} bump from ${base}` };
}

/**
 * @param {string} packageJsonPath
 * @param {string} nextVersion
 */
export function writePackageVersion(packageJsonPath, nextVersion) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  pkg.version = nextVersion;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
