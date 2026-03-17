import { describe, it, expect } from 'vitest';
import { TestCase } from '../../src/models/TestCase.js';

const validTestCase = {
    id: 'TC_001',
    title: 'Add task',
    description: 'Verify user can add a new task',
    steps: [
        { stepNumber: 1, action: 'Enter text', element: 'input', data: 'Buy milk' },
        { stepNumber: 2, action: 'Click', element: 'button' }
    ],
    expectedResult: 'Task appears in the list'
};

describe('TestCase', () => {
    it('parses a valid test case', () => {
        const result = TestCase.safeParse(validTestCase);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBe('TC_001');
            expect(result.data.title).toBe('Add task');
            expect(result.data.steps).toHaveLength(2);
        }
    });

    it('rejects when required field is missing', () => {
        const { id, ...withoutId } = validTestCase;
        expect(TestCase.safeParse(withoutId).success).toBe(false);

        const { description, ...withoutDesc } = validTestCase;
        expect(TestCase.safeParse(withoutDesc).success).toBe(false);
    });

    it('rejects invalid steps shape', () => {
        const invalid = { ...validTestCase, steps: [{ stepNumber: 1 }] };
        expect(TestCase.safeParse(invalid).success).toBe(false);
    });
});
