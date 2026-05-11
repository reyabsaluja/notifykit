import type { PayloadSchema, PrimitiveSchema } from "./types.js";

type ArkProp = {
  key: string;
  value: { expression: string };
  kind: string;
};

type ArkLikeType = {
  assert(data: unknown): Record<string, unknown>;
  props: ArkProp[];
};

const expressionToPrimitive: Record<string, PrimitiveSchema> = {
  string: "string",
  number: "number",
  boolean: "boolean",
};

/**
 * Derive a `PayloadSchema` and a `validate` function from an ArkType object
 * type. This lets you define the payload once — ArkType provides both the
 * runtime validation and the primitive schema that NotifyKit uses for template
 * variable checks and type inference.
 *
 * ```ts
 * import { type } from "arktype";
 * import { arktypePayload } from "@notifykitjs/core/arktype";
 * import { notification } from "@notifykitjs/core";
 *
 * const { payload, validate } = arktypePayload(
 *   type({ name: "string", count: "number" }),
 * );
 *
 * const def = notification({
 *   id: "invoice_created",
 *   payload,
 *   validate,
 *   channels: [inbox({ title: "{{name}}: {{count}}" })],
 * });
 * ```
 *
 * Only top-level fields whose `.expression` is exactly `"string"`, `"number"`,
 * or `"boolean"` appear in the inferred `PayloadSchema`. Constrained or
 * transformed fields (e.g. `"string.email"`, `"number > 0"`) are still
 * validated by ArkType at runtime but won't appear in the primitive schema
 * (and can't be used in `{{template}}` variables).
 */
export function arktypePayload(
  arkType: ArkLikeType,
): {
  payload: PayloadSchema;
  validate: (data: unknown) => Record<string, unknown>;
} {
  const payload: Record<string, PrimitiveSchema> = {};
  for (const prop of arkType.props) {
    const key = prop.key;
    const expr = prop.value.expression;
    if (expr in expressionToPrimitive) {
      payload[key] = expressionToPrimitive[expr]!;
    } else {
      console.warn(
        `[notifykit/arktype] Field "${key}" (expression: "${expr}") was not mapped ` +
          `to a primitive schema (string | number | boolean). It will still be ` +
          `validated by ArkType at runtime but cannot be used in {{template}} variables.`,
      );
    }
  }
  return {
    payload,
    validate: (data: unknown) => arkType.assert(data),
  };
}
