import { z } from "zod";

// Shared element schema. Both addElements and updateElements use this shape
// (updateElements via a nullable variant). Keeping it in one place means the
// agent sees the same field names whether it's creating new shapes or editing
// existing ones.
//
// Nullable rather than optional so OpenAI strict mode stays on. Null means
// "not applicable for this element type" (e.g. points on a rectangle).

export const elementSchema = z.object({
  id: z.string().describe("Unique identifier. Pick concise ids that hint at meaning, like 'rect_login' or 'arrow_login_db'."),
  type: z.enum(["rectangle", "ellipse", "diamond", "text", "arrow", "line"]),
  x: z.number().describe("X position in pixels"),
  y: z.number().describe("Y position in pixels"),
  width: z.number().describe("Width in pixels"),
  height: z.number().describe("Height in pixels"),
  strokeColor: z.string().nullable().describe("Stroke color (hex). Null for default."),
  backgroundColor: z.string().nullable().describe("Fill color. Null for default."),
  fillStyle: z.enum(["solid", "hachure", "cross-hatch"]).nullable(),
  strokeWidth: z.number().nullable(),
  roughness: z.number().nullable().describe("0 for clean, 1 for sketchy. Null for default."),
  opacity: z.number().nullable(),
  text: z.string().nullable().describe("Text content for text elements or labels. Null if not applicable."),
  fontSize: z.number().nullable(),
  fontFamily: z.number().nullable().describe("1=Virgil, 2=Helvetica, 3=Cascadia. Null for default."),
  textAlign: z.enum(["left", "center", "right"]).nullable(),
  points: z
    .array(z.array(z.number()))
    .nullable()
    .describe("Array of [x,y] points for arrow/line elements. Null for non line shapes."),
  startBinding: z
    .object({
      elementId: z.string(),
      focus: z.number(),
      gap: z.number(),
    })
    .nullable()
    .describe("Bind arrow start to an element. Null for non arrows."),
  endBinding: z
    .object({
      elementId: z.string(),
      focus: z.number(),
      gap: z.number(),
    })
    .nullable()
    .describe("Bind arrow end to an element. Null for non arrows."),
});

export type ElementInput = z.infer<typeof elementSchema>;
