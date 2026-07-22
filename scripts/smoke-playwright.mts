import { ensurePlaywrightBrowsersPath } from "../lib/playwright-env.ts";
import { chromium } from "playwright";

ensurePlaywrightBrowsersPath();
const b = await chromium.launch({ headless: true });
console.log("launch ok", process.env.PLAYWRIGHT_BROWSERS_PATH);
await b.close();
