import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cosine, createVecmem } from "../lib/store.js";

describe("cosine", () => {
  it("identical vectors -> 1", () => {
    assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  });
  it("orthogonal -> 0", () => {
    assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
  });
});

describe("workspace namespace", () => {
  it("stores workspace on add, filters search, clears by workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dsh-vecmem-"));
    const storePath = join(dir, "store.json");
    const emb = [1, 0, 0];
    const vm = createVecmem({
      storePath,
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { embedding: emb };
        },
      }),
    });
    try {
      await vm.add({ text: "alpha crumb", workspace: "im:feishu" });
      await vm.add({ text: "beta crumb", workspace: "im:wecom" });
      await vm.add({ text: "gamma crumb" });

      const all = await vm.search({ query: "crumb", topK: 10 });
      assert.equal(all.hits.length, 3);

      const feishu = await vm.search({ query: "crumb", workspace: "im:feishu", topK: 10 });
      assert.equal(feishu.hits.length, 1);
      assert.equal(feishu.hits[0].meta.workspace, "im:feishu");
      assert.equal(feishu.workspace, "im:feishu");

      const cleared = vm.clear({ workspace: "im:feishu" });
      assert.equal(cleared.ok, true);
      assert.equal(cleared.cleared, "workspace");
      assert.equal(cleared.removed, 1);
      assert.equal(cleared.remaining, 2);

      const after = await vm.search({ query: "crumb", workspace: "im:feishu", topK: 10 });
      assert.equal(after.hits.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
