import { tool } from "ai";
import { z } from "zod";
import { getIndex, type VectorEnv } from "../rag/vector-store";

// searchKnowledge is the RAG tool. It queries the Upstash Vector index for
// the top-K most similar corpus entries and returns them as context for the
// agent to read before drawing.
//
// Same factory pattern as makeSearchWeb: we take env at request time so the
// Upstash credentials can come from the Worker's per-request env, not from
// a top-level import. This also lets the eval harness pass them through.
//
// We store the original document text on metadata.content during embed so we
// can return it here. Upstash's query response only includes metadata for
// results — the `data` field that was embedded is not echoed back.

export function makeSearchKnowledge(env: VectorEnv) {
  return tool({
    description: `Search the private knowledge base for reference material on systems, processes, and topics the user might ask you to draw. Use this BEFORE drawing when the request touches a specific technical system, protocol, organizational structure, or process where precise details matter. The corpus contains short reference docs the model may not have memorized accurately.

Example: searchKnowledge({ query: "OAuth 2.0 authorization code flow with PKCE" })`,
    inputSchema: z.object({
      query: z.string().describe("Natural language query describing what you need to know"),
    }),
    execute: async ({ query }) => {
      try {
        const index = getIndex(env);
        const results = await index.query({
          data: query,
          topK: 3,
          includeMetadata: true,
        });
        return {
          results: results.map((r) => ({
            source: (r.metadata as { source?: string } | undefined)?.source ?? String(r.id),
            content: (r.metadata as { content?: string } | undefined)?.content ?? "",
            score: r.score,
          })),
        };
      } catch (err) {
        return { error: `Knowledge search failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });
}
