import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs, promisify } from "node:util";
import { generateText } from "ai";
import readXlsxFile from "read-excel-file/node";
import { createModel, openrouterCost } from "../src/lib/model.ts";

const run = promisify(execFile);

const MATERIALS_DIR = "materials";
const KNOWLEDGE_DIR = "knowledge";
const VISION_DIR = path.join(KNOWLEDGE_DIR, "vision");
const INGEST_MODEL = process.env.INGEST_MODEL || "google/gemini-4-argon";
const THIN_PAGE_WORDS = 40;

// S01 p.6 (Table 1): pdftotext interleaves the columns; the xlsx is the organisers' transcription of it.
const PAGE_OVERRIDES: Record<string, string> = {
  "S01:6": "AFS_method_comparison_table.xlsx",
};

const { values: args } = parseArgs({
  options: {
    doc: { type: "string" },
    force: { type: "boolean", default: false },
  },
});

let totalCost = 0;

const pdfs = (await readdir(MATERIALS_DIR))
  .filter((file) => /^S\d\d_.+\.pdf$/.test(file))
  .filter((file) => !args.doc || file.startsWith(`${args.doc}_`))
  .sort();

await mkdir(VISION_DIR, { recursive: true });
await Promise.all(pdfs.map(ingestPdf));
console.log(`vision cost: $${totalCost.toFixed(4)}`);

async function ingestPdf(file: string) {
  const id = file.slice(0, 3);
  const source = path.join(MATERIALS_DIR, file);
  const { stdout: info } = await run("pdfinfo", [source]);
  const pageCount = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
  const title = file.replace(/^S\d\d_/, "").replace(/\.pdf$/, "").replaceAll("_", " ");
  const workDir = await mkdtemp(path.join(tmpdir(), `ingest-${id}-`));

  try {
    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, i) => ingestPage(id, title, source, i + 1, workDir)),
    );
    const header = `# ${id}: ${title}\n\nsource: ${file} · pages: ${pageCount} · vision: ${INGEST_MODEL}\n`;
    await writeFile(path.join(KNOWLEDGE_DIR, `${id}.md`), [header, ...pages].join("\n"));
    console.log(`${id}: ${pageCount} pages`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function ingestPage(id: string, title: string, source: string, page: number, workDir: string) {
  const override = PAGE_OVERRIDES[`${id}:${page}`];
  const body = override
    ? await spreadsheetToMarkdown(path.join(MATERIALS_DIR, override))
    : (await run("pdftotext", ["-f", `${page}`, "-l", `${page}`, "-enc", "UTF-8", source, "-"])).stdout.trim();
  const notes = override ? "" : await visionNotes(id, title, source, page, body, workDir);
  return `## ${id} p.${page}\n\n${body}\n${notes ? `\n${notes}\n` : ""}`;
}

async function visionNotes(id: string, title: string, source: string, page: number, text: string, workDir: string) {
  const cachePath = path.join(VISION_DIR, `${id}-p${String(page).padStart(2, "0")}.md`);
  if (!args.force) {
    const cached = await readFile(cachePath, "utf8").catch(() => null);
    if (cached !== null) return cached.trim();
  }

  const prefix = path.join(workDir, `p${page}`);
  await run("pdftoppm", ["-f", `${page}`, "-l", `${page}`, "-r", "110", "-png", "-singlefile", source, prefix]);
  const image = await readFile(`${prefix}.png`);
  const thin = text.split(/\s+/).filter(Boolean).length < THIN_PAGE_WORDS;

  const result = await generateText({
    model: createModel(INGEST_MODEL),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: visionPrompt(`${id} (${title}), page ${page}`, text, thin) },
          { type: "file", data: image, mediaType: "image/png" },
        ],
      },
    ],
  });
  totalCost += openrouterCost(result.finalStep.providerMetadata);

  const notes = /^none\b/i.test(result.text.trim()) ? "" : result.text.trim();
  await writeFile(cachePath, `${notes}\n`);
  return notes;
}

async function spreadsheetToMarkdown(file: string) {
  const sheets = await readXlsxFile(file);
  return sheets
    .map(({ sheet, data }) => {
      const rows = data.map((row) => row.map((cell) => String(cell ?? "").replaceAll("|", "\\|")));
      if (rows.every((row) => row.length <= 1)) {
        return `Sheet "${sheet}":\n\n${rows.map((row) => `- ${row[0] ?? ""}`).join("\n")}`;
      }
      const [head, ...body] = rows;
      const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
      return [`Sheet "${sheet}":`, "", line(head), line(head.map(() => "---")), ...body.map(line)].join("\n");
    })
    .join("\n\n");
}

function visionPrompt(page: string, text: string, thin: boolean) {
  const rules = [
    "Copy numbers, units and labels exactly as printed. Mark any reading you are unsure of with [?].",
    "Do not add interpretation, background knowledge, or any number that is not visible on the image.",
    "Skip logos, QR codes, icons and decorative images. Use no markdown headings or horizontal rules; plain lines, bullets and tables only.",
  ];
  const task = thin
    ? [
        `This is ${page}. Its text layer is thin or missing, so the content is mostly in the image.`,
        'Transcribe the page as markdown, starting with the line "[Slide transcription]".',
        "Include every visible heading, bullet, label, table cell, chart title, axis label, legend entry and readable value.",
        "For a chart or diagram, say in one or two lines what is plotted and list the readable values. For a photo, one line on what it shows.",
      ]
    : [
        `This is ${page}. Its text layer is given below the image.`,
        "Describe only content that is visible on the image but missing from the text layer: figures, charts, diagrams, photos, tables.",
        'For each, write one paragraph starting with "[Figure: <caption or short name>]": what is shown or plotted, axis labels and units, legend entries, and the readable values.',
        "If a table in the text layer is scrambled, transcribe that table as markdown instead.",
        "Do not repeat the text layer. If there is no such content, answer exactly NONE.",
      ];
  return [...task, ...rules, "", "Text layer:", "<text_layer>", text || "(empty)", "</text_layer>"].join("\n");
}
