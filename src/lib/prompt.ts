import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const knowledgeDir = path.join(process.cwd(), "knowledge");
const promptsDir = path.join(process.cwd(), "prompts");

function documentBlock(file: string) {
  const id = path.basename(file, ".md");
  const [header, ...pages] = readFileSync(path.join(knowledgeDir, file), "utf8").split(/^## S\d\d p\.(\d+)\n/m);
  const title = /^# \S+: (.+)$/m.exec(header)?.[1] ?? id;
  const source = /^source: (\S+)/m.exec(header)?.[1] ?? "";

  const pageBlocks = [];
  for (let i = 0; i < pages.length; i += 2) {
    const page = pages[i];
    const href = `/materials/${source}#page=${page}`;
    pageBlocks.push(`<page id="${id}" p="${page}" href="${href}">\n${pages[i + 1].trim()}\n</page>`);
  }
  return `<document id="${id}" title="${title}" source="${source}">\n${pageBlocks.join("\n")}\n</document>`;
}

const knowledgeFiles = readdirSync(knowledgeDir)
  .filter((file) => /^S\d\d\.md$/.test(file))
  .sort();

export const instructions = [
  readFileSync(path.join(promptsDir, "system.md"), "utf8").trim(),
  `<materials>\n${knowledgeFiles.map(documentBlock).join("\n\n")}\n</materials>`,
].join("\n\n");

export const reminder = readFileSync(path.join(promptsDir, "reminder.md"), "utf8").trim();

export const promptHash = createHash("sha256")
  .update(instructions)
  .update(reminder)
  .digest("hex")
  .slice(0, 12);

export function withReminder(enquiry: string) {
  return `${enquiry.trim()}\n\n${reminder}`;
}
