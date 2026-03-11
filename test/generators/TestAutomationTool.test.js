/**
 * Unit tests for TestAutomationTool.
 * @see {@link module:src/generators/TestAutomationTool}
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

const {
    defaultCode,
    mockReadFileUtf8,
    mockEnsureOutputDirWritable,
    mockWriteFileUtf8,
    mockToSafeFilename,
    mockCreateLogger,
    mockGetLLMConfig,
    mockInvoke,
    mockChatGoogleGenerativeAI
} = vi.hoisted(() => {
    const defaultCode = "import { test, expect } from '@playwright/test';\ntest('example', async ({ page }) => {});";
    const mockReadFileUtf8 = vi.fn().mockResolvedValue('{"id":"TC_001","title":"Test"}');
    const mockEnsureOutputDirWritable = vi.fn().mockResolvedValue(undefined);
    const mockWriteFileUtf8 = vi.fn().mockResolvedValue(undefined);
    const mockToSafeFilename = vi.fn((id, fallback) => id || fallback);
    const mockCreateLogger = vi.fn(() => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
    const mockGetLLMConfig = vi.fn(() => ({
        model: 'gemini-2.5-flash-lite',
        temperature: 0.1,
        topP: 0.9,
        maxOutputTokens: 8192
    }));
    const mockInvoke = vi.fn().mockResolvedValue({
        content: JSON.stringify({ code: defaultCode })
    });
    const mockChatGoogleGenerativeAI = vi.fn(() => ({ invoke: mockInvoke }));
    return {
        defaultCode,
        mockReadFileUtf8,
        mockEnsureOutputDirWritable,
        mockWriteFileUtf8,
        mockToSafeFilename,
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
    writeFileUtf8: (...args) => mockWriteFileUtf8(...args),
    toSafeFilename: (...args) => mockToSafeFilename(...args)
}));

vi.mock('@langchain/google-genai', () => ({
    ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI
}));

vi.mock('commander', () => ({
    program: {
        name: vi.fn(function () { return this; }),
        requiredOption: vi.fn(function () { return this; }),
        parse: vi.fn(),
        opts: vi.fn(() => ({ testcase: '', pageobject: '', output: '' }))
    }
}));

vi.spyOn(process, 'exit').mockImplementation(() => {});

const { default: TestAutomationTool } = await import('../../src/generators/TestAutomationTool.js');

describe('TestAutomationTool', () => {
    let tool;

    beforeEach(() => {
        vi.clearAllMocks();
        mockReadFileUtf8.mockResolvedValue('{"id":"TC_001","title":"Test"}');
        mockEnsureOutputDirWritable.mockResolvedValue(undefined);
        mockWriteFileUtf8.mockResolvedValue(undefined);
        mockToSafeFilename.mockImplementation((id, fallback) => id || fallback);
        mockInvoke.mockResolvedValue({ content: JSON.stringify({ code: defaultCode }) });
        tool = new TestAutomationTool();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('_readFile', () => {
        it('normalizes path and calls readFileUtf8 with label', async () => {
            const content = 'file content';
            mockReadFileUtf8.mockResolvedValue(content);

            const result = await tool._readFile('some/testcase.json', 'Test case file');

            expect(mockReadFileUtf8).toHaveBeenCalledTimes(1);
            expect(mockReadFileUtf8).toHaveBeenCalledWith(
                path.normalize('some/testcase.json'),
                'Test case file'
            );
            expect(result).toBe(content);
        });

        it('uses default label "File" when not provided', async () => {
            mockReadFileUtf8.mockResolvedValue('x');

            await tool._readFile('path.json');

            expect(mockReadFileUtf8).toHaveBeenCalledWith(
                path.normalize('path.json'),
                'File'
            );
        });

        it('propagates errors from readFileUtf8', async () => {
            mockReadFileUtf8.mockRejectedValue(new Error('ENOENT'));

            await expect(tool._readFile('missing.json')).rejects.toThrow('ENOENT');
        });
    });

    describe('_callLLM', () => {
        it('calls LLM with config (temperature 0.1) and returns { code }', async () => {
            const code = "test('x', () => {});";
            mockInvoke.mockResolvedValue({ content: JSON.stringify({ code }) });

            const result = await tool._callLLM([
                { role: 'system', content: 'System' },
                { role: 'user', content: 'User' }
            ]);

            expect(mockGetLLMConfig).toHaveBeenCalledWith({ temperature: 0.1 });
            expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'gemini-2.5-flash-lite',
                    temperature: 0.1,
                    topP: 0.9,
                    maxOutputTokens: 8192
                })
            );
            expect(mockInvoke).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ code });
        });

        it('returns { code: "" } when response has no content', async () => {
            mockInvoke.mockResolvedValue(null);

            const result = await tool._callLLM([{ role: 'user', content: 'x' }]);

            expect(result).toEqual({ code: '' });
        });

        it('throws on LLM error', async () => {
            mockInvoke.mockRejectedValue(new Error('Invalid API key'));

            await expect(
                tool._callLLM([{ role: 'user', content: 'x' }])
            ).rejects.toThrow('LLM invocation failed: Invalid API key');
            expect(mockInvoke).toHaveBeenCalledTimes(1);
        });
    });

    describe('_saveTestFile', () => {
        const validCode = "import { test } from '@playwright/test';\ntest('x', () => {});";

        it('uses toSafeFilename, ensures output dir, writes .spec.js and returns path', async () => {
            mockToSafeFilename.mockReturnValue('TC_ADD_TASK_001');

            const outPath = await tool._saveTestFile('TC_ADD_TASK_001', validCode, '/out/dir');

            expect(mockToSafeFilename).toHaveBeenCalledWith('TC_ADD_TASK_001', 'automated-test');
            expect(mockEnsureOutputDirWritable).toHaveBeenCalledWith('/out/dir');
            expect(mockWriteFileUtf8).toHaveBeenCalledWith(
                path.join('/out/dir', 'TC_ADD_TASK_001.spec.js'),
                validCode.trim(),
                'test file'
            );
            expect(outPath).toBe(path.join('/out/dir', 'TC_ADD_TASK_001.spec.js'));
        });

        it('throws when code is empty string', async () => {
            await expect(
                tool._saveTestFile('TC_001', '', '/out')
            ).rejects.toThrow('Invalid test code: non-empty string required');
            expect(mockEnsureOutputDirWritable).not.toHaveBeenCalled();
            expect(mockWriteFileUtf8).not.toHaveBeenCalled();
        });

        it('throws when code is only whitespace', async () => {
            await expect(
                tool._saveTestFile('TC_001', '   \n  ', '/out')
            ).rejects.toThrow('Invalid test code: non-empty string required');
        });

        it('throws when code is not a string', async () => {
            await expect(
                tool._saveTestFile('TC_001', null, '/out')
            ).rejects.toThrow('Invalid test code: non-empty string required');
        });

        it('uses fallback filename when toSafeFilename returns fallback', async () => {
            mockToSafeFilename.mockReturnValue('automated-test');

            await tool._saveTestFile('', validCode, '/out');

            expect(mockWriteFileUtf8).toHaveBeenCalledWith(
                path.join('/out', 'automated-test.spec.js'),
                validCode.trim(),
                'test file'
            );
        });

        it('propagates errors from ensureOutputDirWritable', async () => {
            mockEnsureOutputDirWritable.mockRejectedValue(new Error('Permission denied'));

            await expect(
                tool._saveTestFile('TC_001', validCode, '/out')
            ).rejects.toThrow('Permission denied');
        });

        it('propagates errors from writeFileUtf8', async () => {
            mockWriteFileUtf8.mockRejectedValue(new Error('Disk full'));

            await expect(
                tool._saveTestFile('TC_001', validCode, '/out')
            ).rejects.toThrow('Disk full');
        });
    });

    describe('automateTests', () => {
        const testCaseContent = '{"id":"TC_ADD_001","title":"Add item","steps":[],"expectedResult":""}';
        const pageObjectContent = 'class TodoPage {}';
        const generatedCode = "import { test, expect } from '@playwright/test';\ntest('Add item', async ({ page }) => {});";

        beforeEach(() => {
            mockReadFileUtf8
                .mockResolvedValueOnce(testCaseContent)
                .mockResolvedValueOnce(pageObjectContent);
            mockInvoke.mockResolvedValue({ content: JSON.stringify({ code: generatedCode }) });
            mockToSafeFilename.mockReturnValue('TC_ADD_001');
        });

        it('reads test case and page object, calls LLM, saves .spec.js and returns result', async () => {
            const result = await tool.automateTests(
                '/path/tc.json',
                '/path/todo-page.js',
                '/output'
            );

            expect(mockReadFileUtf8).toHaveBeenCalledTimes(2);
            expect(mockReadFileUtf8).toHaveBeenNthCalledWith(
                1,
                path.normalize('/path/tc.json'),
                'Test case file'
            );
            expect(mockReadFileUtf8).toHaveBeenNthCalledWith(
                2,
                path.normalize('/path/todo-page.js'),
                'Page object file'
            );

            const invokeMessages = mockInvoke.mock.calls[0][0];
            expect(invokeMessages).toHaveLength(2);
            expect(invokeMessages[0].constructor.name).toBe('SystemMessage');
            expect(invokeMessages[1].constructor.name).toBe('HumanMessage');
            expect(invokeMessages[1].content).toContain('## Test case');
            expect(invokeMessages[1].content).toContain('## Page object');
            expect(invokeMessages[1].content).toContain(testCaseContent);
            expect(invokeMessages[1].content).toContain(pageObjectContent);

            expect(mockToSafeFilename).toHaveBeenCalledWith('TC_ADD_001', 'automated-test');
            expect(mockWriteFileUtf8).toHaveBeenCalledWith(
                path.join('/output', 'TC_ADD_001.spec.js'),
                generatedCode.trim(),
                'test file'
            );

            expect(result).toEqual({
                testCaseId: 'TC_ADD_001',
                code: generatedCode,
                outputFile: path.join('/output', 'TC_ADD_001.spec.js')
            });
        });

        it('uses default testCaseId "automated-test" when test case has no id', async () => {
            mockReadFileUtf8
                .mockReset()
                .mockResolvedValueOnce('{"title":"No id"}')
                .mockResolvedValueOnce(pageObjectContent);
            mockToSafeFilename.mockReturnValue('automated-test');

            const result = await tool.automateTests('tc.json', 'po.js', '/out');

            expect(mockToSafeFilename).toHaveBeenCalledWith('automated-test', 'automated-test');
            expect(result.testCaseId).toBe('automated-test');
            expect(result.outputFile).toBe(path.join('/out', 'automated-test.spec.js'));
        });

        it('uses default testCaseId when test case JSON is invalid', async () => {
            mockReadFileUtf8
                .mockReset()
                .mockResolvedValueOnce('not json')
                .mockResolvedValueOnce(pageObjectContent);
            mockToSafeFilename.mockReturnValue('automated-test');

            const result = await tool.automateTests('tc.json', 'po.js', '/out');

            expect(result.testCaseId).toBe('automated-test');
        });

        it('includes relative page object import path in user prompt', async () => {
            mockReadFileUtf8
                .mockReset()
                .mockResolvedValueOnce(testCaseContent)
                .mockResolvedValueOnce(pageObjectContent);

            await tool.automateTests(
                '/project/tc.json',
                '/project/pageobjects/todo-page.js',
                '/project/output'
            );

            const userContent = mockInvoke.mock.calls[0][0][1].content;
            expect(userContent).toMatch(/Import path to use for the page object:/);
        });

        it('throws when LLM returns no code', async () => {
            mockInvoke.mockResolvedValue({ content: '{}' });

            await expect(
                tool.automateTests('tc.json', 'po.js', '/out')
            ).rejects.toThrow('LLM returned empty or invalid test code.');
            expect(mockEnsureOutputDirWritable).not.toHaveBeenCalled();
            expect(mockWriteFileUtf8).not.toHaveBeenCalled();
        });

        it('throws when LLM returns empty string code', async () => {
            mockInvoke.mockResolvedValue({ content: JSON.stringify({ code: '   ' }) });

            await expect(
                tool.automateTests('tc.json', 'po.js', '/out')
            ).rejects.toThrow('LLM returned empty or invalid test code.');
        });

        it('throws when reading test case fails', async () => {
            mockReadFileUtf8.mockReset();
            mockReadFileUtf8.mockRejectedValue(new Error('ENOENT'));

            await expect(
                tool.automateTests('missing.json', 'po.js', '/out')
            ).rejects.toThrow('ENOENT');
            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it('throws when reading page object fails', async () => {
            mockReadFileUtf8.mockReset();
            mockReadFileUtf8
                .mockResolvedValueOnce(testCaseContent)
                .mockRejectedValueOnce(new Error('ENOENT'));

            await expect(
                tool.automateTests('tc.json', 'missing.js', '/out')
            ).rejects.toThrow('ENOENT');
            expect(mockInvoke).not.toHaveBeenCalled();
        });
    });
});
