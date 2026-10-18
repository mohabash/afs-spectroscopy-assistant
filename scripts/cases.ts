import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createAssistant, webSearch } from "../src/lib/agent.ts";
import { modelId, openrouterCost } from "../src/lib/model.ts";
import { promptHash, withReminder } from "../src/lib/prompt.ts";

const CASE_FILES = [
  "materials/customer_scenarios_for_final_evaluation.txt",
  "evals/cases/dev.txt",
  "evals/cases/traps.txt",
];
const BANNER = /^={78}\n([A-Z]\d\d) \| (.+)\n={78}\n/m;

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string" },
    out: { type: "string" },
    repeat: { type: "string", default: "1" },
  },
});
const model = args.model ?? modelId;
const repeat = Number(args.repeat);
if (!Number.isInteger(repeat) || repeat < 1) throw new Error(`--repeat must be a positive integer, got ${args.repeat}`);

const cases = new Map<string, string>();
for (const file of CASE_FILES) {
  const [, ...parts] = (await readFile(file, "utf8")).split(BANNER);
  for (let i = 0; i < parts.length; i += 3) {
    const enquiry = parts[i + 2]
      .trim()
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replaceAll("\n", " "))
      .join("\n\n");
    cases.set(parts[i], enquiry);
  }
}

const ids = positionals.length > 0 ? positionals.map((id) => id.toUpperCase()) : [...cases.keys()].filter((id) => id.startsWith("H"));
const unknown = ids.filter((id) => !cases.has(id));
if (unknown.length > 0) throw new Error(`Unknown case ids: ${unknown.join(", ")}. Known: ${[...cases.keys()].join(", ")}`);

const outDir = path.join("outputs", args.out ?? model.replaceAll("/", "_"));
await mkdir(outDir, { recursive: true });

const runs = ids.flatMap((id) => Array.from({ length: repeat }, (_, i) => ({ id, key: i === 0 ? id : `${id}-r${i + 1}` })));
const [first, ...rest] = runs;
const warm = await Promise.allSettled([runCase(first)]);
const settled = [...warm, ...(await Promise.allSettled(rest.map(runCase)))];
const records = settled.flatMap((outcome) => (outcome.status === "fulfilled" ? [outcome.value] : []));

const runsPath = path.join(outDir, "runs.json");
const previous: Record<string, unknown> = JSON.parse(await readFile(runsPath, "utf8").catch(() => "{}"));
await writeFile(runsPath, `${JSON.stringify({ ...previous, ...Object.fromEntries(records.map((r) => [r.key, r])) }, null, 2)}\n`);
console.table(records.map(({ key, seconds, inputTokens, cachedTokens, outputTokens, cost, webSources }) => ({ key, seconds, inputTokens, cachedTokens, outputTokens, cost, web: webSources.length })));

settled.forEach((outcome, i) => {
  if (outcome.status === "rejected") console.error(`${runs[i].key} failed:`, outcome.reason);
});
if (records.length < runs.length) process.exitCode = 1;

async function runCase({ id, key }: { id: string; key: string }) {
  const started = performance.now();
  const result = await createAssistant(model).generate({ prompt: withReminder(cases.get(id)!) });
  const seconds = Math.round((performance.now() - started) / 100) / 10;

  await writeFile(path.join(outDir, `${key}.md`), `${result.text.trim()}\n`);

  return {
    key,
    id,
    model,
    provider: result.finalStep.providerMetadata?.openrouter?.provider ?? null,
    seconds,
    inputTokens: result.usage.inputTokens,
    cachedTokens: result.usage.inputTokenDetails.cacheReadTokens,
    outputTokens: result.usage.outputTokens,
    reasoningTokens: result.usage.outputTokenDetails.reasoningTokens,
    cost: result.steps.reduce((sum, step) => sum + openrouterCost(step.providerMetadata), 0),
    steps: result.steps.length,
    finishReason: result.finishReason,
    webSearch,
    webSources: result.sources.flatMap((source) => (source.sourceType === "url" ? [source.url] : [])),
    promptHash,
    timestamp: new Date().toISOString(),
  };
}
