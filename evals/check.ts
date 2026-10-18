import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: pnpm check <outputs dir>");

const pages = new Map<string, Set<number>>();
for (const file of (await readdir("knowledge")).filter((name) => /^S\d\d\.md$/.test(name))) {
  const text = await readFile(path.join("knowledge", file), "utf8");
  const source = /^source: (\S+)/m.exec(text)?.[1];
  const numbers = new Set([...text.matchAll(/^## S\d\d p\.(\d+)$/gm)].map((match) => Number(match[1])));
  if (source) pages.set(source, numbers);
}

const runs: Record<string, { webSources?: string[] }> = JSON.parse(
  await readFile(path.join(dir, "runs.json"), "utf8").catch(() => "{}"),
);

const rows = [];
for (const file of (await readdir(dir)).filter((name) => name.endsWith(".md")).sort()) {
  const key = file.replace(/\.md$/, "");
  const text = await readFile(path.join(dir, file), "utf8");
  const questions = /### Clarification questions\n([\s\S]*?)(?=\n### |$)/.exec(text)?.[1] ?? "";
  const numbered = questions.split("\n").filter((line) => /^\d+\.\s/.test(line));
  const links = [...text.matchAll(/\[(S\d\d)[^\]]*?p\.(\d+)[^\]]*\]\(\/materials\/([^)#]+)#page=(\d+)\)/g)];
  const badLinks = links.filter(([, id, textPage, file, hrefPage]) => {
    const known = pages.get(file);
    return !file.startsWith(id) || textPage !== hrefPage || !known?.has(Number(hrefPage));
  });
  rows.push({
    key,
    words: text.split(/\s+/).filter(Boolean).length,
    status: text.startsWith("**Decision status:**") ? /:\*\*\s*([^,.;—–]+)/.exec(text)?.[1].trim().slice(0, 28) : "MISSING",
    premise: /\*\*Premise check:\*\*/.test(text),
    questions: numbered.length,
    why: numbered.filter((line) => /why it matters/i.test(line)).length,
    citations: links.length,
    badLinks: badLinks.map(([match]) => match).join(" ") || "",
    unparsed: (text.match(/\]\(\/materials\//g) ?? []).length - links.length,
    web: runs[key]?.webSources?.length ?? 0,
  });
}
console.table(rows);
