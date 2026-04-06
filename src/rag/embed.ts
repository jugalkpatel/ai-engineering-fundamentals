// One-shot embed script. Run with `npm run embed` after editing files in
// data/corpus/. The script:
//
//   1. resets the Upstash Vector index (drops every existing vector)
//   2. reads every .md file under data/corpus/
//   3. upserts each file as one record, with raw text on the `data` field
//      and the file name on metadata.source
//
// Idempotency comes from the reset call, not from upsert dedup. Re-running
// the script always produces the same end state.
//
// Embeddings are generated server-side by Upstash — the index was created
// with a hosted embedding model selected on the dashboard, which is why we
// can pass `data: "...text..."` instead of running an embedding API
// ourselves. Swapping providers later means rethinking this script.

import { readdir, readFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { getIndex } from "./vector-store";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CORPUS_DIR = join(__dirname, "..", "..", "data", "corpus");

async function main() {
  const index = getIndex({
    UPSTASH_VECTOR_REST_URL: process.env.UPSTASH_VECTOR_REST_URL,
    UPSTASH_VECTOR_REST_TOKEN: process.env.UPSTASH_VECTOR_REST_TOKEN,
  });

  console.log("Resetting index...");
  await index.reset();

  const entries = await readdir(CORPUS_DIR);
  const files = entries.filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} corpus files in ${CORPUS_DIR}`);

  let ok = 0;
  let failed = 0;
  for (const file of files) {
    const id = parse(file).name;
    try {
      const content = await readFile(join(CORPUS_DIR, file), "utf8");
      await index.upsert({
        id,
        data: content,
        metadata: { source: file, content },
      });
      console.log(`  upserted ${id}`);
      ok++;
    } catch (err) {
      console.error(`  failed ${id}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`Done. ${ok} upserted, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
