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

export default class TestAutomationTool {
    async _readFile(filePath, label = 'File') {
        const content = await readFileUtf8(path.normalize(filePath), label);
        log.debug(`Read ${label}: ${filePath} (${content.length} chars)`);
        return content;
    }

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
