import { z } from 'zod/v3';

export const TestStep = z.object({
    stepNumber: z.number(),
    action: z.string(),
    element: z.string(),
    data: z.string().optional()
});
