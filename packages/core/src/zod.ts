import type { PayloadSchema, PrimitiveSchema } from "./types.js";

type ZodLikeField = unknown;

type ZodLikeSchema<Shape extends Record<string, ZodLikeField> = Record<string, ZodLikeField>> = {
  parse(data: unknown): Record<string, unknown>;
  shape: Shape;
};

/**
 * Map a Zod field's branded `type` string to our `PrimitiveSchema` literal.
 * Falls back to `never` for unsupported types (arrays, objects, enums, etc.)
 * so they're excluded from the inferred `PayloadSchema`.
 */
type InferFieldPrimitive<F> =
  F extends { def: { type: "string" } } ? "string" :
  F extends { def: { type: "number" } } ? "number" :
  F extends { def: { type: "boolean" } } ? "boolean" :
  F extends { _def: { typeName: "ZodString" } } ? "string" :
  F extends { _def: { typeName: "ZodNumber" } } ? "number" :
  F extends { _def: { typeName: "ZodBoolean" } } ? "boolean" :
  never;

/**
 * From a Zod shape, extract only the keys whose fields resolve to a known
 * primitive, and produce the corresponding `PayloadSchema` record type.
 */
type InferPayloadSchema<Shape extends Record<string, ZodLikeField>> = {
  [K in keyof Shape as InferFieldPrimitive<Shape[K]> extends never ? never : K]:
    InferFieldPrimitive<Shape[K]>;
};

const typeNameToPrimitive: Record<string, PrimitiveSchema> = {
  ZodString: "string",
  ZodNumber: "number",
  ZodBoolean: "boolean",
  string: "string",
  number: "number",
  boolean: "boolean",
};

const wrapperTypeNames = new Set(["ZodOptional", "ZodNullable", "ZodDefault", "ZodReadonly"]);

/**
 * Resolve the primitive schema string for a single Zod field at runtime.
 * Checks Zod v3's `_def.typeName`, Zod v4's `def.type`, and the constructor
 * name as a last resort.
 *
 * NOTE: The `constructor.name` fallback can be mangled by bundlers /
 * minifiers. In practice this only fires when both `_def.typeName` (v3) and
 * `def.type` (v4) are absent, which doesn't happen with stock Zod builds.
 * If you use a heavily-minified Zod bundle, prefer the `_def` / `def` paths
 * by ensuring your Zod version populates them.
 */
function inferPrimitive(field: ZodLikeField): PrimitiveSchema | undefined {
  let current: unknown = field;
  for (let depth = 0; depth < 5; depth++) {
    const v3Name = getStringProperty(getObjectProperty(current, "_def"), "typeName");
    if (v3Name && v3Name in typeNameToPrimitive) return typeNameToPrimitive[v3Name];
    if (v3Name && wrapperTypeNames.has(v3Name)) {
      const inner = getObjectProperty(current, "_def");
      current = inner?.["innerType"];
      if (!current) return undefined;
      continue;
    }

    const v4Type = getStringProperty(getObjectProperty(current, "def"), "type");
    if (v4Type && v4Type in typeNameToPrimitive) return typeNameToPrimitive[v4Type];
    if (v4Type && (v4Type === "optional" || v4Type === "nullable" || v4Type === "default")) {
      const def = getObjectProperty(current, "def");
      current = def?.["innerType"] ?? def?.["wrapped"];
      if (!current) return undefined;
      continue;
    }

    const ctorName = getStringProperty(getObjectProperty(current, "constructor"), "name");
    if (ctorName && ctorName in typeNameToPrimitive) return typeNameToPrimitive[ctorName];

    return undefined;
  }
  return undefined;
}

function getObjectProperty(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== "object" && typeof value !== "function") return undefined;
  if (value === null) return undefined;
  const property = (value as Record<string, unknown>)[key];
  if (typeof property !== "object" && typeof property !== "function") return undefined;
  if (property === null) return undefined;
  return property as Record<string, unknown>;
}

function getStringProperty(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const property = value?.[key];
  return typeof property === "string" ? property : undefined;
}

/**
 * Derive a `PayloadSchema` and a `validate` function from a single Zod
 * object schema. This lets you define the payload once — Zod provides both
 * the runtime validation and the primitive schema that NotifyKit uses for
 * template variable checks and type inference.
 *
 * ```ts
 * import { z } from "zod";
 * import { zodPayload } from "notifykit/zod";
 * import { notification } from "notifykit";
 *
 * const { payload, validate } = zodPayload(
 *   z.object({ name: z.string(), count: z.number() }),
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
 * Works with Zod v3 and v4. Only top-level `z.string()`, `z.number()`, and
 * `z.boolean()` fields appear in the inferred `PayloadSchema`. Fields using
 * other Zod types (arrays, objects, enums, etc.) are still validated by Zod
 * at runtime but won't appear in the primitive schema (and can't be used in
 * `{{template}}` variables).
 */
export function zodPayload<const T extends ZodLikeSchema>(
  schema: T,
): {
  payload: InferPayloadSchema<T["shape"]>;
  validate: (data: unknown) => Record<string, unknown>;
} {
  const payload: Record<string, PrimitiveSchema> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const primitive = inferPrimitive(field);
    if (primitive) {
      payload[key] = primitive;
    } else {
      console.warn(
        `[notifykit/zod] Field "${key}" was not mapped to a primitive schema ` +
          `(string | number | boolean). It will still be validated by Zod at ` +
          `runtime but cannot be used in {{template}} variables. If this field ` +
          `is a z.string()/z.number()/z.boolean() and you're seeing this after ` +
          `bundling, your minifier may have stripped Zod's internal type markers.`,
      );
    }
  }
  return {
    payload: payload as InferPayloadSchema<T["shape"]>,
    validate: (data: unknown) => schema.parse(data),
  };
}
