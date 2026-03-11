/**
 * PageObjectGenerator – generates a Playwright page object (ES module) from user interaction traces via LLM.
 * @module generators/PageObjectGenerator
 */

import path from 'path';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { program } from 'commander';
import dotenv from 'dotenv';

import { createLogger, getLLMConfig, ensureOutputDirWritable, readFileUtf8, writeFileUtf8 } from '../utils/index.js';

dotenv.config();

const log = createLogger('[PageObjectGenerator]');

const SYSTEM_PROMPT = `You generate a Playwright page object as one JavaScript ES module (plain JS, no TypeScript).
- One class: constructor(page), getters for locators (getByRole, getByPlaceholder, getByLabel, getByTestId), async methods for actions.
- camelCase names. Export default the class. Output raw JS only, no markdown fences.`;

/**
 * Generates a Playwright page object from user interaction traces using an LLM.
 */
export default class PageObjectGenerator {
    async _readFile(filePath, label = 'Traces file') {
        const pathWithExtension = path.normalize(filePath.endsWith('.traces') ? filePath : `${filePath}.traces`);
        const content = await readFileUtf8(pathWithExtension, label);
        log.debug(`Read ${label}: ${pathWithExtension} (${content.length} chars)`);
        return content;
    }

    _stripCodeFence(code) {
        const trimmed = code.trim();
        const m = trimmed.match(/^```(?:js|javascript)?\s*([\s\S]*?)```\s*$/);
        return m ? m[1].trim() : trimmed;
    }

    async _callLLM(tracesContent) {
        const config = getLLMConfig({ temperature: 0 });
        log.info('Calling LLM...', { model: config.model });
        const llm = new ChatGoogleGenerativeAI({
            ...config,
            convertSystemMessageToHumanContent: true
        });
        try {
            const response = await llm.invoke([
                new SystemMessage(SYSTEM_PROMPT),
                new HumanMessage(`Traces:\n\n${tracesContent}`)
            ]);
            const content = typeof response?.content === 'string' ? response.content : String(response?.content ?? '');
            return this._stripCodeFence(content);
        } catch (err) {
            log.error('LLM failed:', err.message);
            throw new Error(`LLM invocation failed: ${err.message}`);
        }
    }

    async savePageObject(source, outputPath) {
        if (typeof source !== 'string' || !source.trim()) {
            throw new Error('Invalid page object result: expected non-empty JavaScript source string');
        }
        await ensureOutputDirWritable(outputPath);
        const outFile = path.join(outputPath, 'po.js');
        await writeFileUtf8(outFile, source.trimEnd(), 'page object output');
        log.info('Saved page object to', outFile);
        return outFile;
    }

    async generatePageObject(tracesPath, outputPath) {
        log.info('Starting page object generation:', { tracesPath, outputPath });

        const tracesContent = await this._readFile(tracesPath);
        const source = await this._callLLM(tracesContent);

        if (!source || !source.trim()) {
            log.error('LLM returned no page object code.');
            throw new Error('LLM returned empty or invalid page object.');
        }

        const outPath = await this.savePageObject(source, outputPath);
        log.info('Page object generation completed successfully.');
        return { path: outPath, source };
    }
}

program
    .name('page-object-generator')
    .requiredOption('--i, --input <path>', 'Input file path (traces, .md optional)')
    .requiredOption('--o, --output <path>', 'Output folder path')
    .parse(process.argv);

const { input, output } = program.opts();

/**
 * CLI entry point: runs the generator and exits with code 1 on error.
 */
async function run() {
    try {
        const generator = new PageObjectGenerator();
        await generator.generatePageObject(input, output);
    } catch (err) {
        log.error(err.message);
        process.exit(1);
    }
}

run();
