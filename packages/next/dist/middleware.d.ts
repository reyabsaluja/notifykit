import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
export type NotifyKitMiddlewareOptions = {
    basePath?: string;
    cors?: {
        origin: string | string[];
        credentials?: boolean;
    };
};
export declare function createNotifyKitMiddleware(options?: NotifyKitMiddlewareOptions): (request: NextRequest) => NextResponse | null;
export declare function withNotifyKitHeaders(basePath?: string): {
    source: string;
    headers: {
        key: string;
        value: string;
    }[];
};
//# sourceMappingURL=middleware.d.ts.map