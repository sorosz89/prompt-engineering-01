/**
 * Shared file and directory utilities for generators.
 * Uses fs-extra for Promise-based file operations and path for cross-platform paths.
 * @module utils/fileUtils
 */

import fse from 'fs-extra';
import path from 'path';
import { constants } from 'node:fs';

/** Characters unsafe in filenames; replaced with '-' by toSafeFilename. */
export const UNSAFE_FILENAME_CHARS = /[/\\?*:|"]/g;

/**
 * Asserts that a file exists and is readable.
 * @param {string} filePath - Path to the file (use path.join for cross-platform paths)
 * @param {string} label - Human-readable name for error messages
 * @returns {Promise<void>}
 * @throws {Error} If the file is missing or not readable
 */
export async function ensureFileExists(filePath, label) {
    const normalizedPath = path.normalize(filePath);
    const exists = await fse.pathExists(normalizedPath);
    if (!exists) {
        throw new Error(`${label} not found: ${normalizedPath}`);
    }
    try {
        await fse.access(normalizedPath, constants.R_OK);
    } catch (err) {
        const message = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
        throw new Error(`${label} not readable: ${normalizedPath}. ${message}`);
    }
}

/**
 * Ensures the output directory exists and is writable.
 * @param {string} dirPath - Path to the output directory (use path.join for cross-platform)
 * @returns {Promise<void>}
 * @throws {Error} If the directory cannot be created or written to
 */
export async function ensureOutputDirWritable(dirPath) {
    const normalizedPath = path.normalize(dirPath);
    try {
        await fse.ensureDir(normalizedPath);
        const testFile = path.join(normalizedPath, '.write-test');
        await fse.writeFile(testFile, '', 'utf8');
        await fse.remove(testFile);
    } catch (err) {
        const message = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
        throw new Error(`Output directory not writable: ${normalizedPath}. ${message}`);
    }
}

/**
 * Reads a file as UTF-8. Ensures the file exists and is readable before reading.
 * @param {string} filePath - Path to the file (use path.join for cross-platform)
 * @param {string} [label='File'] - Human-readable name for error messages
 * @returns {Promise<string>} File contents as UTF-8
 * @throws {Error} If the file is missing or cannot be read
 */
export async function readFileUtf8(filePath, label = 'File') {
    const normalizedPath = path.normalize(filePath);
    await ensureFileExists(normalizedPath, label);
    try {
        return await fse.readFile(normalizedPath, 'utf8');
    } catch (err) {
        const message = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
        throw new Error(`Failed to read ${label} ${normalizedPath}: ${message}`);
    }
}

/**
 * Writes content to a file as UTF-8. Ensures the parent directory exists.
 * @param {string} filePath - Path to the file (use path.join for cross-platform)
 * @param {string} content - Content to write
 * @param {string} [label='file'] - Human-readable name for error messages
 * @returns {Promise<void>}
 * @throws {Error} If the file cannot be written
 */
export async function writeFileUtf8(filePath, content, label = 'file') {
    const normalizedPath = path.normalize(filePath);
    try {
        await fse.ensureDir(path.dirname(normalizedPath));
        await fse.writeFile(normalizedPath, content, 'utf8');
    } catch (err) {
        const message = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
        throw new Error(`Failed to write ${label} ${normalizedPath}: ${message}`);
    }
}

/**
 * Sanitizes a string for use as a filename (replaces unsafe characters with '-').
 * @param {string} id - Raw identifier (e.g. test case id)
 * @param {string} fallback - Value to return if id is empty after sanitization
 * @returns {string} Safe filename segment
 */
export function toSafeFilename(id, fallback) {
    const safe = String(id).replace(UNSAFE_FILENAME_CHARS, '-').trim();
    return safe || fallback;
}
