/**
 * TestAutomationTool – generates Playwright automated test JavaScript from a test case and page object via LLM.
 * @module generators/TestAutomationTool
 */

import path from 'path';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { program } from 'commander';
import dotenv from 'dotenv';

import {
    createLogger,
    getLLMConfig,
    ensureOutputDirWritable,
    readFileUtf8,
    writeFileUtf8,
    toSafeFilename
} from '../utils/index.js';

dotenv.config();

const log = createLogger('[TestAutomationTool]');

/** CREATE-framework system prompt: Context, Request, Expectations, Action, Tone/Format, End. */
const SYSTEM_PROMPT = `Context
You are a Playwright test code generator. You produce one runnable test file from a test case (JSON) and a page object (JavaScript module).

Request
Generate a single Playwright test file that covers the given test case using only the provided page object.

Expectations
- Use only selectors and methods from the page object. Do not invent new selectors.
- Map each test case step to page object method calls. Use expect() for assertions.
- One or more test() blocks with descriptive titles covering steps and expected result.

Action
- Import: \`import { test, expect } from '@playwright/test';\` and the page object from the import path given in the user message.
- Use \`test('title', async ({ page }) => { ... })\` and instantiate with \`new PageObjectClass(page)\`.
- Output must run with \`npx playwright test\`.

Tone/Format
- Return a JSON object with a single key \`code\`. The value is the complete .js file content.
- Plain ECMAScript only: no TypeScript, no type annotations, no \`: Page\`, no \`interface\` or \`type\`.
- No markdown, no explanation—only the JSON.

End
Ensure the code is valid JavaScript and uses only the provided page object API.`;

/**
 * Builds the user prompt containing test case JSON, page object source, and optional import path.
 * @param {string} testCaseContent - Raw test case JSON content
 * @param {string} pageObjectContent - Page object JavaScript source
 * @param {string} [pageObjectPath=''] - Relative import path for the page object (e.g. for the generated test file)
 * @returns {string} Combined user message content
 */
function buildUserPrompt(testCaseContent, pageObjectContent, pageObjectPath = '') {
    const parts = [
        'Generate a Playwright test file (plain ECMAScript) from the test case and page object below.',
        'Return JSON with one key "code" whose value is the full test file content.',
        '',
        '## Test case',
        testCaseContent,
        '',
        '## Page object',
        pageObjectPath ? `Import path to use for the page object: ${pageObjectPath}\n\n` : '',
        pageObjectContent
    ];
    return parts.join('\n');
}

program
    .name('test-automation-tool')
    .requiredOption('--testcase, --tc <path>', 'Path to the test case JSON file')
    .requiredOption('--pageobject, --po <path>', 'Path to the page object JavaScript file')
    .requiredOption('--output, --o <path>', 'Output directory for the generated test file')
    .parse(process.argv);

const opts = program.opts();
const testcasePath = opts.testcase ?? opts.tc;
const pageobjectPath = opts.pageobject ?? opts.po;
const outputPath = opts.output ?? opts.o;

/**
 * Generates Playwright automated test JavaScript from a test case (JSON) and page object (JS) using an LLM.
 */
export default class TestAutomationTool {
    /**
     * Reads a file as UTF-8. Normalizes the path before reading.
     * @param {string} filePath - Path to the file
     * @param {string} [label='File'] - Label for errors and debug logs
     * @returns {Promise<string>} File contents
     * @throws {Error} If the file does not exist or cannot be read
     */
    async _readFile(filePath, label = 'File') {
        const content = await readFileUtf8(path.normalize(filePath), label);
        log.debug(`Read ${label}: ${filePath} (${content.length} chars)`);
        return content;
    }

    /**
     * Invokes the LLM with the given messages and returns parsed { code } from the response.
     * @param {Array<{ role: 'system'|'user', content: string }>} messages - System and user messages
     * @returns {Promise<{ code: string }>} Object with a single `code` property (test file content)
     * @throws {Error} If the LLM request fails
     */
    async _callLLM(messages) {
        const config = getLLMConfig({ temperature: 0.1 });
        log.info('Calling LLM for automated test generation...', { model: config.model });
        const llm = new ChatGoogleGenerativeAI({
            model: config.model,
            temperature: config.temperature,
            topP: config.topP,
            maxOutputTokens: config.maxOutputTokens
        });

        const langchainMessages = messages.map(({ role, content }) =>
            role === 'system' ? new SystemMessage(content) : new HumanMessage(content)
        );

        try {
            const response = await llm.invoke(langchainMessages);
            log.info('LLM response received.');
            const content = typeof response?.content === 'string' ? response.content : String(response?.content ?? '');
            return this._parseCodeFromResponse(content);
        } catch (err) {
            log.error('LLM invocation failed:', err.message);
            throw new Error(`LLM invocation failed: ${err.message}`);
        }
    }

    /**
     * Extracts test code from LLM response: parses JSON with a "code" key, or falls back to raw content.
     * @param {string} content - Raw LLM response content (e.g. JSON string or plain text)
     * @returns {{ code: string }} Object with `code` property; may be empty string if parsing fails
     */
    _parseCodeFromResponse(content) {
        const trimmed = content.trim();
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed.code === 'string') return { code: parsed.code };
            if (parsed && typeof parsed === 'object') return { code: '' };
        } catch {
            // not JSON
        }
        const jsonMatch = trimmed.match(/\{[\s\S]*"code"[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed && typeof parsed.code === 'string') return { code: parsed.code };
            } catch {
                // ignore
            }
        }
        return { code: trimmed };
    }

    /**
     * Validates test code, ensures output directory is writable, and writes a .spec.js file.
     * @param {string} testCaseId - Used for filename (sanitized via toSafeFilename); fallback "automated-test"
     * @param {string} code - Generated test file content (non-empty)
     * @param {string} outputDir - Output directory path
     * @returns {Promise<string>} Absolute path of the written .spec.js file
     * @throws {Error} If code is invalid or write fails
     */
    async _saveTestFile(testCaseId, code, outputDir) {
        if (!code || typeof code !== 'string' || !code.trim()) {
            throw new Error('Invalid test code: non-empty string required');
        }
        await ensureOutputDirWritable(outputDir);
        const safeName = toSafeFilename(testCaseId, 'automated-test');
        const outFile = path.join(outputDir, `${safeName}.spec.js`);
        await writeFileUtf8(outFile, code.trim(), 'test file');
        log.info('Saved test file to', outFile);
        return outFile;
    }

    /**
     * Runs the full pipeline: read test case and page object, call LLM, save generated test to .spec.js.
     * Derives testCaseId from test case JSON (id field) or uses "automated-test". Computes relative
     * page object import path for the generated test file.
     * @param {string} testCasePath - Path to the test case JSON file
     * @param {string} pageObjectPath - Path to the page object JavaScript file
     * @param {string} outputDir - Output directory for the generated .spec.js file
     * @returns {Promise<{ testCaseId: string, code: string, outputFile: string }>} Id, generated code, and output path
     * @throws {Error} If any step fails or the LLM returns empty/invalid code
     */
    async automateTests(testCasePath, pageObjectPath, outputDir) {
        log.info('Starting automation:', { testCasePath, pageObjectPath, outputDir });

        const testCaseContent = await this._readFile(testCasePath, 'Test case file');
        const pageObjectContent = await this._readFile(pageObjectPath, 'Page object file');

        let testCaseId = 'automated-test';
        try {
            const parsed = JSON.parse(testCaseContent);
            if (parsed?.id) testCaseId = parsed.id;
        } catch {
            // keep default
        }

        const resolvedPo = path.resolve(path.normalize(pageObjectPath));
        const resolvedOut = path.resolve(path.normalize(outputDir));
        let relativePo = path.relative(resolvedOut, resolvedPo).replace(/\\/g, '/');
        if (!relativePo.startsWith('.')) relativePo = './' + relativePo;

        const result = await this._callLLM([
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(testCaseContent, pageObjectContent, relativePo) }
        ]);

        const code = result?.code?.trim() ?? '';
        if (!code) {
            log.error('LLM returned no test code.');
            throw new Error('LLM returned empty or invalid test code.');
        }

        const outputFile = await this._saveTestFile(testCaseId, code, outputDir);
        log.info('Automation completed successfully.');
        return { testCaseId, code, outputFile };
    }
}

/**
 * CLI entry point: runs the tool with commander options and exits with code 1 on error.
 */
async function run() {
    try {
        const tool = new TestAutomationTool();
        await tool.automateTests(testcasePath, pageobjectPath, outputPath);
    } catch (err) {
        log.error(err.message);
        process.exit(1);
    }
}

run();
