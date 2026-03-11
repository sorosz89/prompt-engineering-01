import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import 'dotenv/config';

async function testConnection() {
    try {
        const llm = new ChatGoogleGenerativeAI({
            model: process.env.MODEL || 'gemini-2.5-flash-lite',
            temperature: 0
        });

        const response = await llm.invoke('Say "Hello from JavaScript!"');
        console.log('LLM Response:', response.content);
        console.log('Connection successful!');
    } catch (error) {
        console.error('LLM connection failed:', error.message);
    }
}

testConnection();
