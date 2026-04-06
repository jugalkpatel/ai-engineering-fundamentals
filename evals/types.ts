export type Difficulty = "simple" | "medium" | "hard" | "edge";
export type Category = "layout" | "content" | "structure" | "edge-case";

export interface TestCase {
  id: string;
  input: string;
  expectedCharacteristics: string[];
  difficulty: Difficulty;
  category: Category;
}

export interface EvalResult {
  testCaseId: string;
  input: string;
  response: string;
  elements: unknown[];
  durationMs: number;
  error?: string;
}

export interface ScoredResult extends EvalResult {
  score: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}
