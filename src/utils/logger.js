/**
 * Shared logger factory for generators. Debug output is enabled when DEBUG env is set.
 * @module utils/logger
 */

/**
 * Creates a logger with a fixed prefix for info, error, and debug.
 * @param {string} prefix - Log prefix (e.g. '[PageObjectGenerator]')
 * @returns {{ info: (msg: string, ...args: unknown[]) => void, error: (msg: string, ...args: unknown[]) => void, debug: (msg: string, ...args: unknown[]) => void }}
 */
export function createLogger(prefix) {
    return {
        info: (msg, ...args) => console.log(prefix, msg, ...args),
        error: (msg, ...args) => console.error(prefix, msg, ...args),
        debug: (msg, ...args) => (process.env.DEBUG && console.debug(prefix, msg, ...args))
    };
}
