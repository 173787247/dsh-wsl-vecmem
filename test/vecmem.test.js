import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cosine } from "../lib/store.js";

describe("cosine", () => {
  it("identical vectors -> 1", () => {
    assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  });
  it("orthogonal -> 0", () => {
    assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
  });
});
