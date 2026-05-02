const typeNameToPrimitive = {
    ZodString: "string",
    ZodNumber: "number",
    ZodBoolean: "boolean",
    string: "string",
    number: "number",
    boolean: "boolean",
};
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
function inferPrimitive(field) {
    const v3Name = field._def?.typeName;
    if (v3Name && v3Name in typeNameToPrimitive)
        return typeNameToPrimitive[v3Name];
    const v4Type = field.def?.type;
    if (v4Type && v4Type in typeNameToPrimitive)
        return typeNameToPrimitive[v4Type];
    const ctorName = field.constructor?.name;
    if (ctorName && ctorName in typeNameToPrimitive)
        return typeNameToPrimitive[ctorName];
    return undefined;
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
export function zodPayload(schema) {
    const payload = {};
    for (const [key, field] of Object.entries(schema.shape)) {
        const primitive = inferPrimitive(field);
        if (primitive) {
            payload[key] = primitive;
        }
        else {
            console.warn(`[notifykit/zod] Field "${key}" was not mapped to a primitive schema ` +
                `(string | number | boolean). It will still be validated by Zod at ` +
                `runtime but cannot be used in {{template}} variables. If this field ` +
                `is a z.string()/z.number()/z.boolean() and you're seeing this after ` +
                `bundling, your minifier may have stripped Zod's internal type markers.`);
        }
    }
    return {
        payload: payload,
        validate: (data) => schema.parse(data),
    };
}
//# sourceMappingURL=zod.js.map