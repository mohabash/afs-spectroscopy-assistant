import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MATERIALS_DIR = path.join(process.cwd(), "materials");

export async function GET(_request: Request, ctx: RouteContext<"/materials/[file]">) {
  const { file } = await ctx.params;
  const available = await readdir(MATERIALS_DIR);
  if (!file.endsWith(".pdf") || !available.includes(file)) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(await readFile(path.join(MATERIALS_DIR, file)), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "inline",
      "cache-control": "public, max-age=3600",
    },
  });
}
