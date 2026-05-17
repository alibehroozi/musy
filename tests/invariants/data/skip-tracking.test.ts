// If a test fails, fix the source code, not the test.
//
// Invariants verified here are listed in INVARIANTS.md under DATA-21.

import { describe, it, expect } from "vitest";
import { ListeningEventsSchemaDefinition } from "../../../apps/api/src/modules/play/listening-events.schema.js";

describe("DATA-21: listening_events bucketId/bucketKind co-null invariant", () => {
  it("schema defines a bucketId field with default null", () => {
    const path = ListeningEventsSchemaDefinition.paths["bucketId"] as unknown as {
      options?: { default?: unknown };
    };
    expect(path).toBeDefined();
    expect(path?.options?.default).toBe(null);
  });

  it("schema defines a bucketKind field with default null", () => {
    const path = ListeningEventsSchemaDefinition.paths["bucketKind"] as unknown as {
      options?: { default?: unknown };
    };
    expect(path).toBeDefined();
    expect(path?.options?.default).toBe(null);
  });

  it("schema restricts bucketKind to enum [auto, custom, null]", () => {
    const path = ListeningEventsSchemaDefinition.paths["bucketKind"] as unknown as {
      options?: { enum?: unknown };
    };
    expect(path?.options?.enum).toEqual(["auto", "custom", null]);
  });

  it("bucketId and bucketKind both have null as their default (co-null guarantee at insert)", () => {
    const bucketIdDefault = (
      ListeningEventsSchemaDefinition.paths["bucketId"] as unknown as {
        options?: { default?: unknown };
      }
    )?.options?.default;
    const bucketKindDefault = (
      ListeningEventsSchemaDefinition.paths["bucketKind"] as unknown as {
        options?: { default?: unknown };
      }
    )?.options?.default;
    // Both must default to null so a caller that omits them gets the co-null shape.
    expect(bucketIdDefault).toBe(null);
    expect(bucketKindDefault).toBe(null);
  });
});
