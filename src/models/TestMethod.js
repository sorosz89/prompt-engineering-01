import { z } from 'zod/v3';

export const TestMethod = z.object({
   name: z.string(),
   annotations: z.array(z.string()),
   parameters: z.array(z.string()),
   body: z.string()
});