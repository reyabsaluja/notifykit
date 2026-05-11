import type { PayloadSchema, PrimitiveSchema } from "./types.js";

type ValibotLikeField = {
  type?: string;
  expects?: string;
};

type ValibotLikeSchema<
  Entries extends Record<string, ValibotLikeField> = Record<string, ValibotLikeField>,
> = {
  entries: Entries;
};

type InferFieldPrimitive<F extends ValibotLikeField> =
  F extends { type: "string" } ? "string" :
  F extends { type: "number" } ? "number" :
  F extends { type: "boolean" } ? "boolean" :
  F extends { expects: "string" } ? "string" :
  F extends { expects: "number" } ? "number" :
  F extends { expects: "boolean" } ? "boolean" :
  never;

type InferPayloadSchema<Entries extends Record<string, ValibotLikeField>> = {
  [K in keyof Entries as InferFieldPrimitive<Entries[K]> extends never ? never : K]:
    InferFieldPrimitive<Entries[K]>;
};

const typeNameToPrimitive: Record<string, PrimitiveSchema> = {
  string: "string",
  number: "number",
  boolean: "boolean",
};

const wrapperTypes = new Set(["optional", "nullable", "nullish", "non_optional", "non_nullable", "non_nullish"]);

function inferPrimitive(field: ValibotLikeField): PrimitiveSchema | undefined {
  let current: ValibotLikeField = field;
  for (let depth = 0; depth < 5; depth++) {
    if (current.type && current.type in typeNameToPrimitive) return typeNameToPrimitive[current.type];
    if (current.expects && current.expects in typeNameToPrimitive) return typeNameToPrimitive[current.expects];
    if (current.type && wrapperTypes.has(current.type) && (current as { wrapped?: ValibotLikeField }).wrapped) {
      current = (current as { wrapped: ValibotLikeField }).wrapped;
      continue;
    }
    return undefined;
  }
  return undefined;
}

/**
 * Derive a `PayloadSchema` and a `validate` function from a Valibot object
 * schema. This lets you define the payload once — Valibot provides both the
 * runtime validation and the primitive schema that NotifyKit uses for template
 * variable checks and type inference.
 *
 * ```ts
 * import * as v from "valibot";
 * import { valibotPayload } from "@notifykitjs/core/valibot";
 * import { notification } from "@notifykitjs/core";
 *
 * const { payload, validate } = valibotPayload(
 *   v.object({ name: v.string(), count: v.number() }),
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
 * Only top-level `v.string()`, `v.number()`, and `v.boolean()` fields appear
 * in the inferred `PayloadSchema`. Fields using other Valibot types (arrays,
 * objects, etc.) are still validated at runtime but won't appear in the
 * primitive schema (and can't be used in `{{template}}` variables).
 *
 * Pass `v.parse` as the second argument so validation can run without
 * NotifyKit importing Valibot at runtime: `valibotPayload(schema, v.parse)`.
 */
export function valibotPayload<
  Entries extends Record<string, ValibotLikeField>,
  T extends ValibotLikeSchema<Entries>,
>(
  schema: T,
  parseFn?: (schema: T, data: unknown) => Record<string, unknown>,
): {
  payload: InferPayloadSchema<Entries>;
  validate: (data: unknown) => Record<string, unknown>;
} {
  const payload: Record<string, PrimitiveSchema> = {};
  for (const [key, field] of Object.entries(schema.entries)) {
    const primitive = inferPrimitive(field);
    if (primitive) {
      payload[key] = primitive;
    } else {
      console.warn(
        `[notifykit/valibot] Field "${key}" was not mapped to a primitive schema ` +
          `(string | number | boolean). It will still be validated by Valibot at ` +
          `runtime but cannot be used in {{template}} variables.`,
      );
    }
  }

  let parse = parseFn;
  return {
    payload: payload as InferPayloadSchema<Entries>,
    validate: (data: unknown) => {
      if (!parse) {
        throw new Error(
          "[notifykit/valibot] No parse function available. " +
            "Pass v.parse as the second argument: valibotPayload(schema, v.parse).",
        );
      }
      return parse(schema, data) as Record<string, unknown>;
    },
  };
}
