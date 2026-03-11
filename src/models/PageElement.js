import { z } from 'zod/v3';

export const PageElement = z.object({
    name: z.string(),
    locator: z.string(),
    description: z.string().optional()
});