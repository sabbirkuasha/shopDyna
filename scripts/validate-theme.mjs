#!/usr/bin/env node
/**
 * shopDyna theme validation.
 *
 * Runs the structural checks that do not need Shopify CLI or a live store, so
 * a broken template, schema, or asset reference is caught before a theme push:
 *
 *   1. Every JSON file under config/, locales/, and templates/ parses.
 *   2. Every {% schema %} block in sections/ and snippets/ is valid JSON and
 *      carries the keys Shopify requires.
 *   3. Every section referenced by a JSON template exists in sections/.
 *   3b. No Liquid tag contains a curly brace, which breaks theme uploads.
 *   4. Every JavaScript file under assets/ parses.
 *   5. Every {{ 'file' | asset_url }} reference resolves to a real asset.
 *   6. No build artifact or forbidden file is about to be uploaded.
 *
 * Usage: npm test
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const errors = [];
const warnings = [];

const rel = (path) => relative(root, path).split("\\").join("/");
const fail = (path, message) => errors.push(`${rel(path)}: ${message}`);
const warn = (path, message) => warnings.push(`${rel(path)}: ${message}`);

const listFiles = (dir, extensions, { recursive = true } = {}) => {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  const found = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) {
      if (recursive)
        found.push(...listFiles(join(dir, entry.name), extensions));
    } else if (extensions.includes(extname(entry.name))) {
      found.push(path);
    }
  }
  return found;
};

/**
 * Shopify allows a leading block comment in locale and settings files. Strip it
 * so the remainder can go through JSON.parse unchanged.
 */
const stripLeadingComment = (source) =>
  source.replace(/^\uFEFF?\s*\/\*[\s\S]*?\*\//, "");

const parseJson = (path, source) => {
  try {
    return JSON.parse(stripLeadingComment(source));
  } catch (error) {
    fail(path, `invalid JSON — ${error.message}`);
    return null;
  }
};

// ---------------------------------------------------------------------------
// 1. JSON files parse

const jsonFiles = [
  ...listFiles("config", [".json"]),
  ...listFiles("locales", [".json"]),
  ...listFiles("templates", [".json"]),
];

for (const path of jsonFiles) parseJson(path, readFileSync(path, "utf8"));

// ---------------------------------------------------------------------------
// 2. Section and snippet schemas

const liquidFiles = [
  ...listFiles("sections", [".liquid"]),
  ...listFiles("snippets", [".liquid"]),
];
const sectionTypes = new Set(
  listFiles("sections", [".liquid"], { recursive: false }).map((path) =>
    path
      .split(/[\\/]/)
      .pop()
      .replace(/\.liquid$/, ""),
  ),
);

for (const path of liquidFiles) {
  const source = readFileSync(path, "utf8");
  const blocks =
    source.match(
      /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/g,
    ) || [];

  if (blocks.length > 1)
    fail(path, "contains more than one {% schema %} block");
  if (!blocks.length) continue;

  const body = blocks[0]
    .replace(/\{%-?\s*schema\s*-?%\}/, "")
    .replace(/\{%-?\s*endschema\s*-?%\}/, "");
  const schema = parseJson(path, body);
  if (!schema) continue;

  if (!schema.name) fail(path, 'schema is missing "name"');
  if (typeof schema.name === "string" && schema.name.length > 25) {
    warn(
      path,
      `schema name "${schema.name}" exceeds the 25-character Theme Editor limit`,
    );
  }

  const seen = new Set();
  for (const setting of schema.settings || []) {
    if (!setting.type) fail(path, 'a schema setting is missing "type"');
    if (setting.type === "header" || setting.type === "paragraph") continue;
    if (!setting.id) fail(path, `a "${setting.type}" setting is missing "id"`);
    if (setting.id && seen.has(setting.id))
      fail(path, `duplicate setting id "${setting.id}"`);
    if (setting.id) seen.add(setting.id);
  }
}

// ---------------------------------------------------------------------------
// 3. JSON templates reference real sections

for (const path of listFiles("templates", [".json"])) {
  const template = parseJson(path, readFileSync(path, "utf8"));
  if (!template || typeof template !== "object") continue;

  const sections = template.sections || {};
  for (const [key, section] of Object.entries(sections)) {
    if (!section?.type) {
      fail(path, `section "${key}" is missing "type"`);
    } else if (!sectionTypes.has(section.type)) {
      fail(
        path,
        `section "${key}" references missing section "${section.type}.liquid"`,
      );
    }
  }
  for (const key of template.order || []) {
    if (!sections[key])
      fail(path, `order references undefined section "${key}"`);
  }
}

// ---------------------------------------------------------------------------
// 3b. Curly braces inside Liquid tags
//
// Shopify's theme-upload parser rejects a literal { or } inside a {{ }} or
// {% %} tag, even in a quoted string, and fails the whole upload with
// "was not properly terminated". Theme Check's parser accepts it, so this is
// checked here instead.

for (const path of [
  ...liquidFiles,
  ...listFiles("layout", [".liquid"]),
  ...listFiles("templates", [".liquid"]),
]) {
  const source = readFileSync(path, "utf8");

  for (const pattern of [/\{\{-?([\s\S]*?)-?\}\}/g, /\{%-?([\s\S]*?)-?%\}/g]) {
    let match;
    while ((match = pattern.exec(source))) {
      const body = match[1];
      if (!/[{}]/.test(body)) continue;
      // `{% comment %}` / `{% endcomment %}` delimiters carry no expression.
      if (/^\s*(comment|endcomment|raw|endraw|schema|endschema)\s*$/.test(body))
        continue;

      const line = source.slice(0, match.index).split("\n").length;
      fail(
        path,
        `line ${line}: curly brace inside a Liquid tag — Shopify's upload parser will reject it. ` +
          `Move the literal braces outside the tag. Found: ${match[0].replace(/\s+/g, " ").slice(0, 80)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 4. JavaScript assets parse

for (const path of listFiles("assets", [".js"], { recursive: false })) {
  try {
    execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
  } catch (error) {
    const detail = String(error.stderr || error.message)
      .split("\n")
      .find((line) => line.includes("Error") || line.includes("error"));
    fail(path, `syntax error — ${detail?.trim() || "see node --check output"}`);
  }
}

// ---------------------------------------------------------------------------
// 5. asset_url references resolve

const assetNames = new Set(
  existsSync(join(root, "assets")) ? readdirSync(join(root, "assets")) : [],
);

for (const path of [...liquidFiles, ...listFiles("layout", [".liquid"])]) {
  const source = readFileSync(path, "utf8");
  const references = source.matchAll(
    /['"]([\w.@-]+\.(?:css|js|jpg|jpeg|png|webp|svg|ico|gif))['"]\s*\|\s*asset_url/g,
  );
  for (const [, name] of references) {
    if (!assetNames.has(name))
      fail(path, `asset_url references missing asset "${name}"`);
  }
}

// ---------------------------------------------------------------------------
// 6. Forbidden files

const forbidden = [
  [
    "layout/checkout.liquid",
    "checkout is managed by Checkout Extensibility, not a Liquid template",
  ],
  [
    "templates/checkout.liquid",
    "checkout is managed by Checkout Extensibility, not a Liquid template",
  ],
];

for (const [path, reason] of forbidden) {
  if (existsSync(join(root, path)))
    errors.push(`${path}: must not exist — ${reason}`);
}

const scanForArtifacts = (dir) => {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) {
      scanForArtifacts(join(dir, entry.name));
    } else if (
      /\.(bak|orig|rej)$/.test(entry.name) ||
      /^\.DS_Store$|^Thumbs\.db$/i.test(entry.name)
    ) {
      errors.push(
        `${rel(path)}: build or OS artifact must be deleted before upload`,
      );
    }
  }
};

for (const dir of [
  "assets",
  "config",
  "layout",
  "locales",
  "sections",
  "snippets",
  "templates",
]) {
  scanForArtifacts(dir);
}

if (!existsSync(join(root, "assets/tailwind.output.css"))) {
  errors.push("assets/tailwind.output.css: missing — run the Tailwind build");
} else if (statSync(join(root, "assets/tailwind.output.css")).size === 0) {
  errors.push("assets/tailwind.output.css: empty — run the Tailwind build");
}

// ---------------------------------------------------------------------------
// Report

const counts = `${jsonFiles.length} JSON files, ${liquidFiles.length} Liquid files`;

if (warnings.length) {
  console.warn(`\n${warnings.length} warning(s):`);
  for (const warning of warnings) console.warn(`  ! ${warning}`);
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const error of errors) console.error(`  x ${error}`);
  console.error(`\nTheme validation failed (${counts} checked).\n`);
  process.exit(1);
}

console.log(`\nTheme validation passed (${counts} checked).\n`);
