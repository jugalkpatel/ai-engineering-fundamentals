import { tool } from "ai";
import { z } from "zod";

export const tools = {
  generateDiagram: tool({
    description:
      "Generate a complete diagram as an array of excalidraw elements. Use this when the user asks you to create, draw or design a new diagram. Return all elements needed including shapes, text labels and arrow/lines connecting them. Position elements with x, y coordinates and give each a unique id.",
    inputSchema: z.object({
      elements: z
        .array(
          z.object({
            // NOTE - With OpenAI if we want to make things optional, we need to make it nullable
            // for example - x: z.number().nullable().describe('X position')
            id: z.string().describe("Unique identifier"),
            type: z.enum([
              "rectangle",
              "ellipse",
              "diamond",
              "text",
              "arrow",
              "line",
            ]),
            x: z.number().describe("X position"),
            y: z.number().describe("Y position"),
            width: z.number().describe("Width"),
            height: z.number().describe("Height"),
            strokeColor: z
              .string()
              .default("#1e1e1e")
              .describe("Stroke color (hex)"),
            backgroundColor: z
              .string()
              .default("transparent")
              .describe("Fill color"),
            fillStyle: z
              .enum(["solid", "hachure", "cross-hatch"])
              .default("solid"),
            strokeWidth: z.number().default(2),
            roughness: z
              .number()
              .default(1)
              .describe("0 for clean, 1 for sketchy"),
            opacity: z.number().default(100),
            text: z
              .string()
              .optional()
              .describe("Text content (for text elements)"),
            fontSize: z.number().default(20),
            fontFamily: z
              .number()
              .default(1)
              .describe("1=Virgil, 2=Helvetica, 3=Cascadia"),
            textAlign: z.enum(["left", "center", "right"]).default("center"),
            points: z
              .array(z.array(z.number()))
              .optional()
              .describe(
                "Array of [x,y] points (for arrow/line elements). Each point is a two number array.",
              ),
            startBinding: z
              .object({
                elementId: z.string(),
                focus: z.number(),
                gap: z.number(),
              })
              .optional()
              .describe("Bind arrow start to an element"),
            endBinding: z
              .object({
                elementId: z.string(),
                focus: z.number(),
                gap: z.number(),
              })
              .optional()
              .describe("Bind arrow end to an element"),
          }),
        )
        .describe("Array of Excalidraw elements that make up the diagram"),
    }),
    // returns things to LLM, in following we're returning elements to LLM
    // we can also return additional context for LLM in execute function
    execute: async ({ elements }) => {
      console.log({ elements });
      return elements;
    },
  }),

  modifyDiagram: tool({
    description:
      "Modify an existing element on the canvas by id. set only the fields you want to change; everything else is left alone.",
    inputSchema: z.object({
      elementId: z.string().describe("The id of the element to modify"),
      // Explicit field list rather than a free form record. OpenAI's strict
      // tool calling rejects unconstrained additionalProperties, and giving
      // the model an enumerated list also tells it exactly what's tweakable.
      updates: z.object({
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        text: z.string().optional(),
        fontSize: z.number().optional(),
        textAlign: z.enum(["left", "center", "right"]).optional(),
        strokeColor: z.string().optional(),
        backgroundColor: z.string().optional(),
        fillStyle: z.enum(["solid", "hachure", "cross-hatch"]).optional(),
        strokeWidth: z.number().optional(),
        roughness: z.number().optional(),
        opacity: z.number().optional(),
      }),
    }),
    execute: async ({ elementId, updates }) => {
      return { elementId, updates };
    },
  }),
};
