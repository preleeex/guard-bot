import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, evaluateBlock, type BlockResult } from "./evaluation";
import type { ResultPolicy, ScenarioBlockDTO } from "../types/scenario";

const policy = (over: Partial<ResultPolicy> = {}): ResultPolicy => ({
  passApprove: true,
  failDecline: true,
  queueThreshold: null,
  ...over,
});

test("math captcha: correct answer passes", () => {
  const block: ScenarioBlockDTO = { id: "c1", type: "captcha", config: { kind: "math" } } as ScenarioBlockDTO;
  const r = evaluateBlock(block, { blockId: "c1", type: "captcha", payload: { value: 7 } }, { c1: { expected: 7 } });
  assert.equal(r.passed, true);
  assert.equal(r.mandatory, true);
});

test("math captcha: wrong answer fails", () => {
  const block: ScenarioBlockDTO = { id: "c1", type: "captcha", config: { kind: "math" } } as ScenarioBlockDTO;
  const r = evaluateBlock(block, { blockId: "c1", type: "captcha", payload: { value: 3 } }, { c1: { expected: 7 } });
  assert.equal(r.passed, false);
});

test("visual captcha: case-insensitive and trimmed", () => {
  const block: ScenarioBlockDTO = { id: "v", type: "captcha", config: { kind: "visual" } } as ScenarioBlockDTO;
  const r = evaluateBlock(block, { blockId: "v", type: "captcha", payload: { value: " ab12 " } }, { v: { code: "AB12" } });
  assert.equal(r.passed, true);
});

test("quiz: scoring and passCount threshold", () => {
  const block: ScenarioBlockDTO = {
    id: "q",
    type: "quiz",
    config: {
      passCount: 1,
      questions: [
        { id: "q1", text: "a", options: ["x", "y"], correct: [0] },
        { id: "q2", text: "b", options: ["x", "y"], correct: [1] },
      ],
    },
  } as unknown as ScenarioBlockDTO;
  const r = evaluateBlock(
    block,
    { blockId: "q", type: "quiz", payload: { selected: { q1: [0], q2: [0] } } },
    {}
  );
  assert.equal(r.score, 50);
  assert.equal(r.passed, true); // 1 correct >= passCount 1
});

test("rules: must agree", () => {
  const block: ScenarioBlockDTO = { id: "r", type: "rules", config: {} } as ScenarioBlockDTO;
  assert.equal(evaluateBlock(block, { blockId: "r", type: "rules", payload: { agreed: true } }, {}).passed, true);
  assert.equal(evaluateBlock(block, { blockId: "r", type: "rules", payload: {} }, {}).passed, false);
});

test("decide: mandatory fail -> decline when failDecline", () => {
  const results: BlockResult[] = [{ blockId: "c", type: "captcha", passed: false, mandatory: true }];
  assert.equal(decide(results, policy({ failDecline: true })).decision, "decline");
  assert.equal(decide(results, policy({ failDecline: false })).decision, "queue");
});

test("decide: all pass -> approve when passApprove", () => {
  const results: BlockResult[] = [{ blockId: "r", type: "rules", passed: true, mandatory: true }];
  assert.equal(decide(results, policy({ passApprove: true })).decision, "approve");
  assert.equal(decide(results, policy({ passApprove: false })).decision, "queue");
});

test("decide: threshold routes below-threshold to queue", () => {
  const results: BlockResult[] = [{ blockId: "q", type: "quiz", passed: true, mandatory: true, score: 50 }];
  assert.equal(decide(results, policy({ queueThreshold: 60 })).decision, "queue");
  assert.equal(decide(results, policy({ queueThreshold: 40 })).decision, "approve");
});
