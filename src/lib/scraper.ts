import { chromium, Browser } from 'playwright';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!browser || !browser.isConnected()) {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
    }
    return browser;
}

async function closeBrowser(): Promise<void> {
    if (browser) {
        await browser.close();
        browser = null;
    }
}

process.on('SIGTERM', () => void closeBrowser());
process.on('SIGINT',  () => void closeBrowser());

export async function fetchRenderedHtml(url: string): Promise<string> {
    const b       = await getBrowser();
    const context = await b.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
    });
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
        return await page.content();
    } finally {
        await context.close();
    }
}
