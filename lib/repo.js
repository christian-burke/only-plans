// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { SPEC, PLAN, readLines, parseSpec, parsePlan } = require("./parse");

/** @typedef {import("./parse").Line} Line */

/** Display paths use "/" on every platform; path.join turns them native for the filesystem. */
const CHANGES_DIR = "docs/changes";
const ARCHIVE_DIR = "archive";
/** A bare `.` or `..` has no slash, so it skips the path check, yet names a real directory. */
const RESERVED_IDS = new Set([".", "..", ARCHIVE_DIR]);

const EXIT = { ok: 0, fail: 1, usage: 2 };

const ARCHIVED = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

/**
 * @typedef {{ file: string, line: number, what: string, fix: string }} Finding
 * @typedef {{ root: string, id: string, dir: string }} Change
 * @typedef {{ cwd: string, positional: string[], flags: Record<string, string | boolean> }} Ctx
 */

class CliError extends Error {
  /** @param {string} message @param {number} [exitCode] */
  constructor(message, exitCode = EXIT.fail) {
    super(message);
    this.exitCode = exitCode;
  }
}

/**
 * Resolves symlinks such as macOS's /var so paths compare by location. A missing path passes.
 * @param {string} file
 */
function realPath(file) {
  return fs.existsSync(file) ? fs.realpathSync(file) : file;
}

/** @param {string} file */
function isDir(file) {
  return fs.existsSync(file) && fs.statSync(file).isDirectory();
}

/**
 * @param {string} file @param {number} line @param {string} what @param {string} fix
 * @returns {Finding}
 */
function finding(file, line, what, fix) {
  return { file, line, what, fix };
}

/** @param {string} id */
function relChange(id) {
  return path.posix.join(CHANGES_DIR, id);
}

/** @param {string} name */
function relArchived(name) {
  return path.posix.join(CHANGES_DIR, ARCHIVE_DIR, name);
}

/** @param {Change} change @param {string} file */
function relFile(change, file) {
  return path.posix.join(relChange(change.id), file);
}

/** @param {string} file */
function missingFileFinding(file) {
  return finding(file, 1, "file is missing", `add ${file}`);
}

/** @param {Change} change @param {Finding} f */
function renderFinding(change, f) {
  return `${relFile(change, f.file)}:${f.line}: ${f.what} — ${f.fix}`;
}

/** @param {string} cwd */
function locateRoot(cwd) {
  let dir = cwd;
  for (;;) {
    if (isDir(path.join(dir, CHANGES_DIR))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** @param {string} cwd */
function requireRoot(cwd) {
  const root = locateRoot(cwd);
  if (!root) {
    throw new CliError(`${CHANGES_DIR}: not found in ${cwd} or above — run onlyplans init`);
  }
  return root;
}

/** @param {string} root */
function changesDir(root) {
  return path.join(root, CHANGES_DIR);
}

/** @param {string} root */
function archiveDir(root) {
  return path.join(changesDir(root), ARCHIVE_DIR);
}

/** @param {string} dir */
function subdirs(dir) {
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** @param {string} root */
function activeIds(root) {
  return subdirs(changesDir(root)).filter((name) => name !== ARCHIVE_DIR);
}

/** @param {string} root @param {string} id */
function archivedEntry(root, id) {
  return subdirs(archiveDir(root)).find((name) => ARCHIVED.exec(name)?.[2] === id);
}

/** @param {string} root @param {string} id @returns {Change} */
function requireChange(root, id) {
  const dir = path.join(changesDir(root), id);
  if (RESERVED_IDS.has(id) || !isDir(dir)) {
    throw new CliError(`${relChange(id)}: no such change — run onlyplans list`);
  }
  return { root, id, dir };
}

/**
 * @template T
 * @param {Change} change @param {string} file @param {(lines: Line[]) => T} parse
 */
function readChangeFile(change, file, parse) {
  const full = path.join(change.dir, file);
  if (!fs.existsSync(full)) {
    throw new CliError(renderFinding(change, missingFileFinding(file)));
  }
  return parse(readLines(full));
}

/** @param {Change} change */
function readPlan(change) {
  return readChangeFile(change, PLAN, parsePlan);
}

/** @param {Change} change */
function readSpec(change) {
  return readChangeFile(change, SPEC, parseSpec);
}

/**
 * Accepts an id or a path to the change folder, such as docs/changes/<id>/, and returns the id.
 * @param {string} cwd @param {string} root @param {string} arg
 */
function idFromArg(cwd, root, arg) {
  if (!arg.includes("/") && !arg.includes(path.sep)) return arg;
  const rel = path.relative(changesDir(root), realPath(path.resolve(cwd, arg)));
  if (!rel || rel.startsWith("..") || rel.includes(path.sep)) {
    throw new CliError(`${arg}: not a change id or a path under ${CHANGES_DIR}`, EXIT.usage);
  }
  return rel;
}

/** @param {Ctx} ctx */
function changeFromCtx(ctx) {
  const root = requireRoot(ctx.cwd);
  return requireChange(root, idFromArg(ctx.cwd, root, ctx.positional[0]));
}

module.exports = {
  CHANGES_DIR,
  ARCHIVE_DIR,
  EXIT,
  CliError,
  isDir,
  relChange,
  relArchived,
  relFile,
  locateRoot,
  requireRoot,
  changesDir,
  archiveDir,
  activeIds,
  archivedEntry,
  changeFromCtx,
  readPlan,
  readSpec,
  finding,
  missingFileFinding,
  renderFinding,
};
