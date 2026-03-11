/**
 * Unit tests for TestCaseGenerator.
 * @see {@link module:src/generators/TestCaseGenerator}
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

const {
    mockReadFileUtf8,
    mockEnsureOutputDirWritable,
    mockWriteFileUtf8,
    mockToSafeFilename,
    mockCreateLogger,
    mockGetLLMConfig,
    mockInvoke,
    mockWithStructuredOutput,
    mockChatGoogleGenerativeAI
} = vi.hoisted(() => {
    const mockReadFileUtf8 = vi.fn().mockResolvedValue('# requirements');
    const mockEnsureOutputDirWritable = vi.fn().mockResolvedValue(undefined);
    const mockWriteFileUtf8 = vi.fn().mockResolvedValue(undefined);
    const mockToSafeFilename = vi.fn((id, fallback) => id || fallback);
    const mockCreateLogger = vi.fn(() => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
    const mockGetLLMConfig = vi.fn(() => ({
        model: 'gemini-2.5-flash-lite',
        temperature: 0,
        topP: 0.9,
        maxOutputTokens: 8192
    }));
    const mockInvoke = vi.fn().mockResolvedValue({
        testCases: [{ id: 'TC_1', title: 'Placeholder', steps: [], expectedResult: '' }]
    });
    const mockWithStructuredOutput = vi.fn(() => ({ invoke: mockInvoke }));
    const mockChatGoogleGenerativeAI = vi.fn(() => ({ withStructuredOutput: mockWithStructuredOutput }));
    return {
        mockReadFileUtf8,
        mockEnsureOutputDirWritable,
        mockWriteFileUtf8,
        mockToSafeFilename,
        mockCreateLogger,
        mockGetLLMConfig,
        mockInvoke,
        mockWithStructuredOutput,
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
        opts: vi.fn(() => ({ input: '', output: '' }))
    }
}));

// Prevent CLI run() from exiting the process when module is loaded
vi.stubGlobal('process', { ...process, exit: vi.fn() });

// Import after mocks so module resolution uses mocks
const { default: TestCaseGenerator } = await import('../../src/generators/TestCaseGenerator.js');

describe('TestCaseGenerator', () => {
    let generator;

    beforeEach(() => {
        vi.clearAllMocks();
        generator = new TestCaseGenerator();
    });

    describe('readFile', () => {
        it('appends .md when path has no .md extension and calls readFileUtf8', async () => {
            const content = '# Requirements';
            mockReadFileUtf8.mockResolvedValue(content);

            const result = await generator.readFile('input/reqs', 'Input file');

            expect(mockReadFileUtf8).toHaveBeenCalledTimes(1);
            expect(mockReadFileUtf8).toHaveBeenCalledWith(
                path.normalize('input/reqs.md'),
                'Input file'
            );
            expect(result).toBe(content);
        });

        it('does not append .md when path already ends with .md', async () => {
            const content = '# Requirements';
            mockReadFileUtf8.mockResolvedValue(content);

            await generator.readFile('input/reqs.md', 'Input file');

            expect(mockReadFileUtf8).toHaveBeenCalledWith(
                path.normalize('input/reqs.md'),
                'Input file'
            );
        });

        it('uses default label when not provided', async () => {
            mockReadFileUtf8.mockResolvedValue('content');

            await generator.readFile('some/path.md');

            expect(mockReadFileUtf8).toHaveBeenCalledWith(
                expect.any(String),
                'Input file'
            );
        });

        it('propagates errors from readFileUtf8', async () => {
            mockReadFileUtf8.mockRejectedValue(new Error('File not found'));

            await expect(generator.readFile('missing')).rejects.toThrow('File not found');
        });
    });

    describe('callLLM', () => {
        it('returns testCases from LLM response', async () => {
            const fakeResponse = {
                testCases: [
                    { id: 'TC_001', title: 'Test 1', steps: [], expectedResult: '' }
                ]
            };
            mockInvoke.mockResolvedValue(fakeResponse);

            const result = await generator.callLLM('Some requirements text');

            expect(mockGetLLMConfig).toHaveBeenCalled();
            expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'gemini-2.5-flash-lite',
                    temperature: 0,
                    topP: 0.9,
                    maxOutputTokens: 8192
                })
            );
            expect(mockWithStructuredOutput).toHaveBeenCalledTimes(1);
            expect(mockInvoke).toHaveBeenCalledTimes(1);
            expect(mockInvoke).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ role: 'system', content: expect.any(String) }),
                    expect.objectContaining({ role: 'user', content: 'Some requirements text' })
                ])
            );
            expect(result).toEqual(fakeResponse);
        });

        it('throws when LLM invoke fails', async () => {
            mockInvoke.mockRejectedValue(new Error('API error'));

            await expect(generator.callLLM('prompt')).rejects.toThrow('LLM invocation failed: API error');
        });
    });

    describe('_writeTestCase', () => {
        it('calls toSafeFilename and writeFileUtf8 with correct path and content', async () => {
            mockToSafeFilename.mockReturnValue('TC_ADD_TASK_001');

            await generator._writeTestCase('/out/dir', { id: 'TC_ADD_TASK_001', title: 'Add task', steps: [], expectedResult: '' }, 0);

            expect(mockToSafeFilename).toHaveBeenCalledWith('TC_ADD_TASK_001', 'test-case-1');
            expect(mockWriteFileUtf8).toHaveBeenCalledTimes(1);
            expect(mockWriteFileUtf8).toHaveBeenCalledWith(
                path.join('/out/dir', 'TC_ADD_TASK_001.json'),
                expect.stringContaining('"id": "TC_ADD_TASK_001"'),
                'test case output'
            );
        });

        it('uses fallback filename when toSafeFilename returns fallback', async () => {
            mockToSafeFilename.mockReturnValue('test-case-2');

            await generator._writeTestCase('/out', { id: '', title: 'T', steps: [], expectedResult: '' }, 1);

            expect(mockToSafeFilename).toHaveBeenCalledWith('', 'test-case-2');
            expect(mockWriteFileUtf8).toHaveBeenCalledWith(
                path.join('/out', 'test-case-2.json'),
                expect.any(String),
                'test case output'
            );
        });
    });

    describe('generateTestCases', () => {
        it('reads file, calls LLM, ensures output dir, writes each test case and returns array', async () => {
            const promptContent = '# Requirements';
            const testCases = [
                { id: 'TC_001', title: 'Test one', steps: [], expectedResult: '' },
                { id: 'TC_002', title: 'Test two', steps: [], expectedResult: '' }
            ];
            mockReadFileUtf8.mockResolvedValue(promptContent);
            mockInvoke.mockResolvedValue({ testCases });
            mockToSafeFilename.mockImplementation((id, fallback) => id || fallback);

            const result = await generator.generateTestCases('input/reqs.md', 'results/');

            expect(mockReadFileUtf8).toHaveBeenCalledWith(
                path.normalize('input/reqs.md'),
                'Input file'
            );
            expect(mockInvoke).toHaveBeenCalledTimes(1);
            expect(mockEnsureOutputDirWritable).toHaveBeenCalledWith('results/');
            expect(mockWriteFileUtf8).toHaveBeenCalledTimes(2);
            expect(mockWriteFileUtf8).toHaveBeenNthCalledWith(
                1,
                path.join('results/', 'TC_001.json'),
                expect.stringContaining('TC_001'),
                'test case output'
            );
            expect(mockWriteFileUtf8).toHaveBeenNthCalledWith(
                2,
                path.join('results/', 'TC_002.json'),
                expect.stringContaining('TC_002'),
                'test case output'
            );
            expect(result).toEqual(testCases);
        });

        it('throws when LLM returns no test cases', async () => {
            mockReadFileUtf8.mockResolvedValue('requirements');
            mockInvoke.mockResolvedValue({ testCases: [] });

            await expect(
                generator.generateTestCases('input.md', 'out/')
            ).rejects.toThrow('LLM returned empty or invalid test cases.');
            expect(mockEnsureOutputDirWritable).not.toHaveBeenCalled();
            expect(mockWriteFileUtf8).not.toHaveBeenCalled();
        });

        it('throws when LLM returns non-array testCases', async () => {
            mockReadFileUtf8.mockResolvedValue('requirements');
            mockInvoke.mockResolvedValue({ testCases: null });

            await expect(
                generator.generateTestCases('input.md', 'out/')
            ).rejects.toThrow('LLM returned empty or invalid test cases.');
        });

        it('throws when readFile fails', async () => {
            mockReadFileUtf8.mockRejectedValue(new Error('Not found'));

            await expect(
                generator.generateTestCases('missing.md', 'out/')
            ).rejects.toThrow('Not found');
        });
    });
});
