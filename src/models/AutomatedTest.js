import { z } from 'zod/v3';
import { TestMethod } from './TestMethod.js';

export const AutomatedTest = z.object({
    className: z.string(),
    moduleName: z.string(),
    imports: z.string(),
    testMethods: z.array(TestMethod)
});