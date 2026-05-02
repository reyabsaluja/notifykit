type ZodLikeField = {
    _def?: {
        typeName?: string;
    };
    def?: {
        type?: string;
    };
};
type ZodLikeSchema<Shape extends Record<string, ZodLikeField> = Record<string, ZodLikeField>> = {
    parse(data: unknown): Record<string, unknown>;
    shape: Shape;
};
/**
 * Map a Zod field's branded `type` string to our `PrimitiveSchema` literal.
 * Falls back to `never` for unsupported types (arrays, objects, enums, etc.)
 * so they're excluded from the inferred `PayloadSchema`.
 */
type InferFieldPrimitive<F extends ZodLikeField> = F extends {
    def: {
        type: "string";
    };
} ? "string" : F extends {
    def: {
        type: "number";
    };
} ? "number" : F extends {
    def: {
        type: "boolean";
    };
} ? "boolean" : F extends {
    _def: {
        typeName: "ZodString";
    };
} ? "string" : F extends {
    _def: {
        typeName: "ZodNumber";
    };
} ? "number" : F extends {
    _def: {
        typeName: "ZodBoolean";
    };
} ? "boolean" : never;
/**
 * From a Zod shape, extract only the keys whose fields resolve to a known
 * primitive, and produce the corresponding `PayloadSchema` record type.
 */
type InferPayloadSchema<Shape extends Record<string, ZodLikeField>> = {
    [K in keyof Shape as InferFieldPrimitive<Shape[K]> extends never ? never : K]: InferFieldPrimitive<Shape[K]>;
};
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
export declare function zodPayload<Shape extends Record<string, ZodLikeField>, T extends ZodLikeSchema<Shape>>(schema: T): {
    payload: InferPayloadSchema<Shape>;
    validate: (data: unknown) => Record<string, unknown>;
};
export {};
//# sourceMappingURL=zod.d.ts.map