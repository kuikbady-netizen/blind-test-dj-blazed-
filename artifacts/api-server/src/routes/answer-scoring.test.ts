import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pointsForAnswer } from "./answer-scoring";

describe("pointsForAnswer", () => {
  it("awards exactly 1000 points for every correct answer", () => {
    assert.equal(pointsForAnswer(true), 1000);
    assert.equal(pointsForAnswer(true), 1000);
    assert.equal(pointsForAnswer(true), 1000);
  });

  it("awards no points for a wrong answer", () => {
    assert.equal(pointsForAnswer(false), 0);
  });

  it("adds equal points across the round regardless of answer order", () => {
    const submissions = [true, true, true];
    const roundPoints = submissions.map(pointsForAnswer);
    assert.deepEqual(roundPoints, [1000, 1000, 1000]);
  });

  it("keeps previously earned points when adding another round's points", () => {
    let totalScore = 0;
    for (const correct of [true, false, true]) {
      totalScore += pointsForAnswer(correct);
    }
    assert.equal(totalScore, 2000);
  });
});
