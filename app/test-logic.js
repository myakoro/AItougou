
import OpenAI from 'openai';
import Store from 'electron-store';
import { fetch } from 'undici'; // node 環境での fetch 代替

// main.js のロジックを抽出してテスト用にラップ
async function testLogic() {
    console.log('--- SyncAI Logic Test ---');

    // 履歴制限のモックテスト
    const messages = [
        { sender: 'user', text: 'Hello 1' },
        { sender: 'ai', text: 'Hi 1' },
        { sender: 'user', text: 'Hello 2' },
        { sender: 'ai', text: 'Hi 2' },
        // ... 中略 ...
    ];

    const recentMessages = [];
    let totalChars = 0;
    const maxChars = 12000;
    const maxPairs = 10;
    const candidates = [...messages].reverse();
    let pairCount = 0;
    for (const msg of candidates) {
        if (msg.sender === 'user') pairCount++;
        if (pairCount > maxPairs) break;
        if (totalChars + msg.text.length > maxChars) break;
        recentMessages.unshift({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text,
        });
        totalChars += msg.text.length;
    }

    console.log(`[Test] History Pair Count: ${pairCount - 1}`);
    console.log(`[Test] History Message Count: ${recentMessages.length}`);
    console.log(`[Test] History Total Chars: ${totalChars}`);

    if (recentMessages.length <= 20 && totalChars <= 12000) {
        console.log('✅ History constraints passed');
    } else {
        console.log('❌ History constraints failed');
    }
}

testLogic();
