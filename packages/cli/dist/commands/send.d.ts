export type SendOptions = {
    cwd: string;
    config?: string;
    notificationId: string;
    recipientId: string;
    payload: Record<string, unknown>;
    recipientEmail?: string;
};
export declare function runSend(options: SendOptions): Promise<number>;
//# sourceMappingURL=send.d.ts.map