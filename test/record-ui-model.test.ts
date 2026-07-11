import { describe, expect, it } from "vitest";
import { buildRecordRenderModel } from "../src/ui/record-model";
import type { RecordCollectionSnapshot } from "../src/api/types";

const record = (id: string, temporary = false): any => ({ id, temporary, schemaVersion: 1, createdAt: 1, createdBy: "u", data: { name: id } });

describe("record collection deterministic UI model", () => {
  it("models large, empty, blocked, temporary, overflow, pending, and missing-link states", () => {
    const snapshot: RecordCollectionSnapshot = {
      id: "echoes", schemaVersion: 1, capacity: 4,
      slots: [
        { id: "s1", record: null },
        { id: "s2", record: record("permanent") },
        { id: "s3", record: record("temporary", true) },
        { id: "s4", record: null, blocked: { reason: "fracture", at: 1, by: "gm" } },
      ],
      pending: [{ id: "p1", record: record("pending"), createdAt: 1 }],
      overflow: Array.from({ length: 40 }, (_, index) => ({ id: `o${index}`, record: record(`overflow${index}`) })),
    };
    const model = buildRecordRenderModel(snapshot, new Set(["permanent", "temporary"]));
    expect(model.slice(0, 5).map((row) => row.status)).toEqual(["pending", "empty", "permanent", "temporary", "blocked"]);
    expect(model[0]).toMatchObject({ missingLink: true, overflow: false });
    expect(model[2]).toMatchObject({ missingLink: false });
    expect(model[5]).toMatchObject({ overflow: true, missingLink: true });
    expect(model).toHaveLength(45);
  });
});
