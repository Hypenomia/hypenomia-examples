import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export const int = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const platformName = (p) => ({ instagram: "Instagram" })[p] ?? p;

export const pct = (share) => `${Math.round(share * 100)}%`;

const row = (cells) => `| ${cells.join(" | ")} |`;

export const table = (head, rows) =>
  [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");

/** Runs `render` on the JSON file named on the command line, when the module is run directly. */
export function runCli(moduleUrl, render) {
  if (!process.argv[1] || pathToFileURL(resolve(process.argv[1])).href !== moduleUrl) return;
  const path = process.argv[2];
  if (!path) {
    console.error("usage: node <workflow>.mjs <input.json>");
    process.exit(2);
  }
  process.stdout.write(render(readJson(path)));
}
