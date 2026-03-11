import { TestCase } from './TestCase.js';
import { z } from 'zod/v3';

export const TestCasesList = z.object({
    testCases: z.array(TestCase),
    metadata: z.record(z.string(), z.unknown()).optional()
});
