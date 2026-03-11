import { z } from 'zod/v3';
import { PageElement } from './PageElement.js';
import { PageMethod } from './PageMethod.js';

export const PageObject = z.object({
    pageObject: z.object({
        className: z.string(),
        moduleName: z.string(),
        imports: z.string(),
        fields: z.array(PageElement),
        methods: z.array(PageMethod)
    })
});
