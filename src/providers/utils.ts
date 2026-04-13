export const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (compatible; private-dictionary-parser/0.3; +https://example.invalid)';

export function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function toAbsoluteUrl(
    href: string | undefined,
    base: string,
): string | undefined {
    if (!href) return undefined;
    try {
        return new URL(href, base).toString();
    } catch {
        return undefined;
    }
}

export function withTimeout(
    signal: AbortSignal | undefined,
    timeoutMs = 10_000,
): AbortSignal {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    controller.signal.addEventListener('abort', () => clearTimeout(timer), {
        once: true,
    });

    if (signal) {
        if (signal.aborted) {
            clearTimeout(timer);
            controller.abort(signal.reason);
        } else {
            signal.addEventListener(
                'abort',
                () => {
                    clearTimeout(timer);
                    controller.abort(signal.reason);
                },
                { once: true },
            );
        }
    }

    return controller.signal;
}
