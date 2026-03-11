/**
 * Unit tests for PageObjectGenerator.
 * @see {@link module:src/generators/PageObjectGenerator}
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

const {
    mockReadFileUtf8,
    mockEnsureOutputDirWritable,
    mockWriteFileUtf8,
    mockCreateLogger,
    mockGetLLMConfig,
    mockInvoke,
    mockChatGoogleGenerativeAI
} = vi.hoisted(() => {
    const mockReadFileUtf8 = vi.fn().mockResolvedValue('# Traces\nclick button');
    const mockEnsureOutputDirWritable = vi.fn().mockResolvedValue(undefined);
    const mockWriteFileUtf8 = vi.fn().mockResolvedValue(undefined);
    const mockCreateLogger = vi.fn(() => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
    const mockGetLLMConfig = vi.fn(() => ({
        model: 'gemini-2.5-flash-lite',
        temperature: 0,
        topP: 0.9,
        maxOutputTokens: 8192
    }));
    const defaultJsSource = `export default class TodoPage {
  constructor(page) { this.page = page; }
  get newTodoInput() { return this.page.getByPlaceholder('What needs to be done?'); }
  async typeNewTodo(text) { await this.newTodoInput.fill(text); }
}`;
    const mockInvoke = vi.fn().mockResolvedValue({ content: defaultJsSource });
    const mockChatGoogleGenerativeAI = vi.fn(() => ({ invoke: mockInvoke }));
    return {
        mockReadFileUtf8,
        mockEnsureOutputDirWritable,
        mockWriteFileUtf8,
        mockCreateLogger,
        mockGetLLMConfig,
        mockInvoke,
        mockChatGoogleGenerativeAI
    };
});

vi.mock('../../src/utils/index.js', () => ({
    createLogger: (...args) => mockCreateLogger(...args),
    getLLMConfig: (...args) => mockGetLLMConfig(...args),
    ensureOutputDirWritable: (...args) => mockEnsureOutputDirWritable(...args),
    readFileUtf8: (...args) => mockReadFileUtf8(...args),
    writeFileUtf8: (...args) => mockWriteFileUtf8(...args)
}));

vi.mock('@langchain/google-genai', () => ({
    ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI
}));

vi.mock('commander', () => ({
    program: {
        name: vi.fn(function () { return this; }),
        requiredOption: vi.fn(function () { return this; }),
        parse: vi.fn(),
        opts: vi.fn(() => ({ input: '', output: '' }))
    }
}));

vi.stubGlobal('process', { ...process, exit: vi.fn() });

const { default: PageObjectGenerator } = await import('../../src/generators/PageObjectGenerator.js');

describe('PageObjectGenerator', () => {
    let generator;

    beforeEach(() => {
        vi.clearAllMocks();
        mockReadFileUtf8.mockResolvedValue('# Traces\nclick button');
        mockEnsureOutputDirWritable.mockResolvedValue(undefined);
        mockWriteFileUtf8.mockResolvedValue(undefined);
        mockInvoke.mockResolvedValue({
            content: `export default class TodoPage {
  constructor(page) { this.page = page; }
  get newTodoInput() { return this.page.getByPlaceholder('...'); }
  async typeNewTodo(text) { await this.newTodoInput.fill(text); }
}`
        });
        generator = new PageObjectGenerator();
    });

    describe('_readFile', () => {
        it('appends .traces when path does not end with .traces and calls readFileUtf8', async () => {
            const content = '# User traces';
            mockReadFileUtf8.mockResolvedValue(content);

            const result = await generator._readFile('input/traces', 'Traces file');

            expect(mockReadFileUtf8).toHaveBeenCalledTimes(1);
            expect(mockReadFileUtf8).toHaveBeenCalledWith(
                path.normalize('input/traces.traces'),
                'Traces file'
            );
            expect(result).toBe(content);
        });

        it('does not append .traces when path already ends with .traces', async () => {
            const content = '# Traces';
            mockReadFileUtf8.mockResolvedValue(content);

            await generator._readFile('input/app.traces', 'Traces file');

            expect(mockReadFileUtf8).toHaveBeenCalledWith(
                path.normalize('input/app.traces'),
                'Traces file'
            );
        });

        it('uses default label "Traces file" when not provided', async () => {
            mockReadFileUtf8.mockResolvedValue('content');

            await generator._readFile('some/path.traces');

            expect(mockReadFileUtf8).toHaveBeenCalledWith(
                expect.any(String),
                'Traces file'
            );
        });

        it('propagates errors from readFileUtf8', async () => {
            mockReadFileUtf8.mockRejectedValue(new Error('File not found'));

            await expect(generator._readFile('missing')).rejects.toThrow('File not found');
        });
    });

    describe('_callLLM', () => {
        it('sends system + user message and returns generated JS source', async () => {
            const jsSource = "export default class LoginPage { constructor(page) { this.page = page; } }";
            mockInvoke.mockResolvedValue({ content: jsSource });

            const result = await generator._callLLM('User prompt');

            expect(mockGetLLMConfig).toHaveBeenCalledWith({ temperature: 0 });
            expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'gemini-2.5-flash-lite',
                    convertSystemMessageToHumanContent: true
                })
            );
            const messages = mockInvoke.mock.calls[0][0];
            expect(messages).toHaveLength(2);
            expect(messages[0].constructor.name).toBe('SystemMessage');
            expect(messages[1].constructor.name).toBe('HumanMessage');
            expect(messages[1].content).toContain('User prompt');
            expect(result).toBe(jsSource);
        });

        it('strips markdown code fence from response content', async () => {
            mockInvoke.mockResolvedValue({
                content: "```js\nexport default class X { }\n```"
            });

            const result = await generator._callLLM('x');

            expect(result).toBe('export default class X { }');
        });

        it('returns empty string when response content is null or undefined', async () => {
            mockInvoke.mockResolvedValue({ content: null });

            const result = await generator._callLLM('x');

            expect(result).toBe('');
        });

        it('throws when LLM invoke fails', async () => {
            mockInvoke.mockRejectedValue(new Error('API error'));

            await expect(
                generator._callLLM('prompt')
            ).rejects.toThrow('LLM invocation failed: API error');
        });
    });

    describe('savePageObject', () => {
        const validSource = `export default class TodoPage {
  constructor(page) { this.page = page; }
  get submitBtn() { return this.page.getByRole('button'); }
}`;

        it('ensures output dir is writable and writes po.js with the JS source', async () => {
            const outPath = await generator.savePageObject(validSource, '/out/dir');

            expect(mockEnsureOutputDirWritable).toHaveBeenCalledWith('/out/dir');
            expect(mockWriteFileUtf8).toHaveBeenCalledTimes(1);
            expect(mockWriteFileUtf8).toHaveBeenCalledWith(
                path.join('/out/dir', 'po.js'),
                validSource.trimEnd(),
                'page object output'
            );
            expect(outPath).toBe(path.join('/out/dir', 'po.js'));
        });

        it('throws when source is null', async () => {
            await expect(generator.savePageObject(null, '/out')).rejects.toThrow(
                'Invalid page object result: expected non-empty JavaScript source string'
            );
            expect(mockEnsureOutputDirWritable).not.toHaveBeenCalled();
            expect(mockWriteFileUtf8).not.toHaveBeenCalled();
        });

        it('throws when source is empty or whitespace', async () => {
            await expect(generator.savePageObject('   ', '/out')).rejects.toThrow(
                'Invalid page object result: expected non-empty JavaScript source string'
            );
            expect(mockWriteFileUtf8).not.toHaveBeenCalled();
        });

        it('propagates errors from ensureOutputDirWritable', async () => {
            mockEnsureOutputDirWritable.mockRejectedValue(new Error('Permission denied'));

            await expect(generator.savePageObject(validSource, '/out')).rejects.toThrow(
                'Permission denied'
            );
        });

        it('propagates errors from writeFileUtf8', async () => {
            mockEnsureOutputDirWritable.mockResolvedValue(undefined);
            mockWriteFileUtf8.mockRejectedValue(new Error('Disk full'));

            await expect(generator.savePageObject(validSource, '/out')).rejects.toThrow(
                'Disk full'
            );
        });
    });

    describe('generatePageObject', () => {
        const defaultJsSource = `export default class TodoPage {
  constructor(page) { this.page = page; }
  get submitBtn() { return this.page.getByRole('button'); }
}`;

        it('reads traces, calls LLM with system and user prompt, saves JS and returns path and source', async () => {
            const tracesContent = '# Traces\nUser clicked Add';
            mockReadFileUtf8.mockResolvedValue(tracesContent);
            mockInvoke.mockResolvedValue({ content: defaultJsSource });

            const result = await generator.generatePageObject('input/traces', 'output/');

            expect(mockReadFileUtf8).toHaveBeenCalledWith(
                path.normalize('input/traces.traces'),
                'Traces file'
            );
            expect(mockInvoke).toHaveBeenCalledTimes(1);
            const messages = mockInvoke.mock.calls[0][0];
            expect(messages).toHaveLength(2);
            expect(messages[0].constructor.name).toBe('SystemMessage');
            expect(messages[1].constructor.name).toBe('HumanMessage');
            expect(messages[1].content).toContain('Traces:');
            expect(messages[1].content).toContain(tracesContent);
            expect(mockEnsureOutputDirWritable).toHaveBeenCalledWith('output/');
            expect(mockWriteFileUtf8).toHaveBeenCalledWith(
                path.join('output/', 'po.js'),
                defaultJsSource.trimEnd(),
                'page object output'
            );
            expect(result).toEqual({ path: path.join('output/', 'po.js'), source: defaultJsSource });
        });

        it('throws when LLM returns empty content', async () => {
            mockReadFileUtf8.mockResolvedValue('traces');
            mockInvoke.mockResolvedValue({ content: '' });

            await expect(
                generator.generatePageObject('input.traces', 'out/')
            ).rejects.toThrow('LLM returned empty or invalid page object.');
            expect(mockEnsureOutputDirWritable).not.toHaveBeenCalled();
            expect(mockWriteFileUtf8).not.toHaveBeenCalled();
        });

        it('throws when LLM returns whitespace-only content', async () => {
            mockReadFileUtf8.mockResolvedValue('traces');
            mockInvoke.mockResolvedValue({ content: '   \n  ' });

            await expect(
                generator.generatePageObject('input.traces', 'out/')
            ).rejects.toThrow('LLM returned empty or invalid page object.');
        });

        it('throws when readFile fails', async () => {
            mockReadFileUtf8.mockRejectedValue(new Error('ENOENT'));

            await expect(
                generator.generatePageObject('missing', 'out/')
            ).rejects.toThrow('ENOENT');
            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it('throws when _callLLM fails', async () => {
            mockReadFileUtf8.mockResolvedValue('traces');
            mockInvoke.mockRejectedValue(new Error('Network error'));

            await expect(
                generator.generatePageObject('input.traces', 'out/')
            ).rejects.toThrow('LLM invocation failed: Network error');
        });
    });
});
