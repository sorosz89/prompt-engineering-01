/**
 * TestCaseGenerator – generates test case JSON files from a prompt (e.g. markdown) using an LLM.
 * Reads an input file, calls the model with structured output (TestCasesListSchema), and writes
 * each test case to a separate JSON file in the output directory.
 * @module generators/TestCaseGenerator
 */

import path from 'path';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { program } from 'commander';
import dotenv from 'dotenv';

import { TestCasesList } from '../models/TestCasesList.js';
import { createLogger, getLLMConfig, ensureOutputDirWritable, readFileUtf8, writeFileUtf8, toSafeFilename } from '../utils/index.js';

dotenv.config();

const log = createLogger('[TestCaseGenerator]');

/** System prompt: role, output format, and rules for test case generation. */
const SYSTEM_PROMPT = `You are a test case generator. Your task is to produce a list of clear, concise software test cases based strictly on the requirements provided.

Instructions:
- Focus on functional, end-user behavior derived directly from the requirements.
- Generate comprehensive test cases, making sure each covers a unique and valuable scenario.
- Use natural language for clarity. Do not include implementation details.
- Do not invent features not described or implied in the requirements.`;

/**
 * Generates test cases from a prompt file using an LLM and writes one JSON file per test case.
 */
export default class TestCaseGenerator {
    /**
     * Reads the prompt file. Adds .md if the path does not end with .md.
     * @param {string} filePath - Path to the prompt file
     * @param {string} [label='Input file'] - Label for errors and debug logs
     * @returns {Promise<string>} File contents as UTF-8
     * @throws {Error} If the file does not exist or cannot be read
     */
    async readFile(filePath, label = 'Input file') {
        const pathWithMd = path.normalize(filePath.endsWith('.md') ? filePath : `${filePath}.md`);
        const content = await readFileUtf8(pathWithMd, label);
        log.debug(`Read ${label}: ${pathWithMd} (${content.length} chars)`);
        return content;
    }

    /**
     * Invokes the LLM with structured output (TestCasesList).
     * @param {string} prompt - User prompt (e.g. requirements content); system prompt is applied internally.
     * @returns {Promise<object>} Parsed result with testCases array (and optional metadata)
     * @throws {Error} If the LLM request fails
     */
    async callLLM(prompt) {
        const config = getLLMConfig();
        log.info('Calling LLM for test case generation...');
        const llm = new ChatGoogleGenerativeAI({
            model: config.model,
            temperature: config.temperature,
            topP: config.topP,
            maxOutputTokens: config.maxOutputTokens
        }).withStructuredOutput(TestCasesList);

        try {
            const response = await llm.invoke([
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ]);
            log.info('LLM response received.');
            return response;
        } catch (err) {
            log.error('LLM invocation failed:', err.message);
            throw new Error(`LLM invocation failed: ${err.message}`);
        }
    }

    /**
     * Writes a single test case to a JSON file in the output directory.
     * @param {string} outputDir - Output directory path
     * @param {object} testCase - Single test case object
     * @param {number} index - Zero-based index (used for fallback filename)
     * @returns {Promise<void>}
     */
    async _writeTestCase(outputDir, testCase, index) {
        const safeName = toSafeFilename(testCase.id, `test-case-${index + 1}`);
        const filePath = path.join(outputDir, `${safeName}.json`);
        await writeFileUtf8(filePath, JSON.stringify(testCase, null, 2), 'test case output');
        log.debug('Wrote', filePath);
    }

    /**
     * Runs the full pipeline: read prompt, call LLM, write one JSON file per test case.
     * @param {string} inputPath - Path to the prompt file (e.g. .md)
     * @param {string} outputPath - Output directory for test case JSON files
     * @returns {Promise<object[]>} The generated test cases array
     * @throws {Error} If any step fails or the LLM returns no test cases
     */
    async generateTestCases(inputPath, outputPath) {
        log.info('Starting test case generation:', { inputPath, outputPath });

        const prompt = await this.readFile(inputPath);
        const result = await this.callLLM(prompt);
        const testCases = result?.testCases ?? [];

        if (!Array.isArray(testCases) || testCases.length === 0) {
            log.error('LLM returned no test cases.');
            throw new Error('LLM returned empty or invalid test cases.');
        }

        await ensureOutputDirWritable(outputPath);
        for (let index = 0; index < testCases.length; index++) {
            await this._writeTestCase(outputPath, testCases[index], index);
        }

        log.info(`Test case generation completed. Wrote ${testCases.length} file(s) to ${outputPath}.`);
        return testCases;
    }
}

program
    .name('test-case-generator')
    .requiredOption('--i, --input <path>', 'Input file path (prompt, .md optional)')
    .requiredOption('--o, --output <path>', 'Output folder path')
    .parse(process.argv);

const { input, output } = program.opts();

/**
 * CLI entry point: runs the generator and exits with code 1 on error.
 */
async function run() {
    try {
        const generator = new TestCaseGenerator();
        await generator.generateTestCases(input, output);
    } catch (err) {
        log.error(err.message);
        process.exit(1);
    }
}

run();
