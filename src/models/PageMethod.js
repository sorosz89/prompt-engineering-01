import { z } from 'zod/v3';

export const PageMethod = z.object({
    name: z.string(),
    returnType: z.string(),
    parameters: z.array(z.string()),
    body: z.string()
});