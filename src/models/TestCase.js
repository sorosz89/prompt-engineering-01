import { z } from 'zod/v3';
import { TestStep } from './TestStep.js';

export const TestCase = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    steps: z.array(TestStep),
    expectedResult: z.string()
});
