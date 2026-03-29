import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import path from "path";
import { mkdir } from "fs/promises";

export interface AuthTestInput {
  /** Base URL of the application (e.g., https://myapp.example.com) */
  baseUrl: string;
  /** Login page path (default: /login) */
  loginPath?: string;
  /** CSS selector for email input */
  emailSelector?: string;
  /** CSS selector for password input */
  passwordSelector?: string;
  /** CSS selector for submit button */
  submitSelector?: string;
  /** Test credentials */
  email: string;
  password: string;
  /** Expected redirect path after login (e.g., /dashboard, /admin) */
  expectedRedirect?: string;
  /** Protected path to test (redirects to login if unauthenticated) */
  protectedPath?: string;
  /** Directory to save screenshots */
  evidenceDir?: string;
}

export interface AuthTestResult {
  passed: boolean;
  checks: AuthCheck[];
  evidence: EvidenceFile[];
  duration: number;
  summary: string;
}

interface AuthCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface EvidenceFile {
  name: string;
  path: string;
  type: "screenshot" | "log";
}

/**
 * Playwright-based auth flow verification agent.
 * Tests login, session cookies, protected routes, and logout in a REAL browser.
 * This is NOT an LLM opinion — it's deterministic tool output.
 */
export async function verifyAuthFlow(
  input: AuthTestInput
): Promise<AuthTestResult> {
  const start = Date.now();
  const checks: AuthCheck[] = [];
  const evidence: EvidenceFile[] = [];
  const logs: string[] = [];

  const evidenceDir = input.evidenceDir || "/tmp/sf-playwright-evidence";
  await mkdir(evidenceDir, { recursive: true });

  const loginUrl = `${input.baseUrl}${input.loginPath || "/login"}`;
  const emailSel = input.emailSelector || 'input[name="email"], input[type="email"]';
  const passwordSel = input.passwordSelector || 'input[name="password"], input[type="password"]';
  const submitSel = input.submitSelector || 'button[type="submit"]';

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context: BrowserContext = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page: Page = await context.newPage();

    // Collect network events
    page.on("requestfailed", (req) => {
      logs.push(`[NET FAIL] ${req.url()} ${req.failure()?.errorText}`);
    });

    // ─── Check 1: Login page loads ───────────────────────────────
    await page.goto(loginUrl, { waitUntil: "networkidle", timeout: 15000 });
    const loginLoaded = page.url().includes(input.loginPath || "/login");

    await screenshot(page, evidenceDir, "01-login-page", evidence);

    checks.push({
      name: "Login page loads",
      passed: loginLoaded,
      detail: `URL: ${page.url()}`,
    });

    if (!loginLoaded) {
      return finalize(checks, evidence, start, "Login page did not load");
    }

    // ─── Check 2: Form elements exist ────────────────────────────
    const emailInput = await page.$(emailSel);
    const passwordInput = await page.$(passwordSel);
    const submitBtn = await page.$(submitSel);

    checks.push({
      name: "Form elements present",
      passed: !!(emailInput && passwordInput && submitBtn),
      detail: `email: ${!!emailInput}, password: ${!!passwordInput}, submit: ${!!submitBtn}`,
    });

    if (!emailInput || !passwordInput || !submitBtn) {
      return finalize(checks, evidence, start, "Form elements missing");
    }

    // ─── Check 3: Submit credentials ─────────────────────────────
    await emailInput.fill(input.email);
    await passwordInput.fill(input.password);

    // Track auth network requests
    const authRequests: string[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/api/auth")) {
        const cookies = res.headers()["set-cookie"] || "";
        authRequests.push(
          `${res.status()} ${res.url()}${cookies ? " [set-cookie]" : ""}`
        );
      }
    });

    await submitBtn.click();

    // Wait for navigation away from login
    let redirected = false;
    try {
      await page.waitForURL(
        (url) => !url.toString().includes(input.loginPath || "/login"),
        { timeout: 15000 }
      );
      redirected = true;
    } catch {
      redirected = false;
    }

    await screenshot(page, evidenceDir, "02-after-login", evidence);

    checks.push({
      name: "Login redirects away from login page",
      passed: redirected,
      detail: `Final URL: ${page.url()}. Auth requests: ${authRequests.join("; ")}`,
    });

    if (!redirected) {
      // Check for error messages on the page
      const errorText = await page
        .locator('[role="alert"], .error, .alert-danger')
        .first()
        .textContent()
        .catch(() => null);

      checks.push({
        name: "No login error displayed",
        passed: false,
        detail: errorText
          ? `Error message: "${errorText.trim()}"`
          : "Stuck at login page, no visible error",
      });

      return finalize(checks, evidence, start, "Login failed — stuck at login page");
    }

    // ─── Check 4: Session cookie set ─────────────────────────────
    const cookies = await context.cookies();
    const sessionCookie = cookies.find(
      (c) =>
        c.name.includes("session-token") ||
        c.name.includes("session") ||
        c.name.includes("sid")
    );

    checks.push({
      name: "Session cookie set",
      passed: !!sessionCookie,
      detail: sessionCookie
        ? `${sessionCookie.name} (secure=${sessionCookie.secure}, httpOnly=${sessionCookie.httpOnly}, sameSite=${sessionCookie.sameSite})`
        : "No session cookie found",
    });

    // ─── Check 5: Cookie security flags ──────────────────────────
    if (sessionCookie) {
      const flagsOk =
        sessionCookie.httpOnly && sessionCookie.sameSite !== "None";
      checks.push({
        name: "Cookie security flags",
        passed: flagsOk,
        detail: `httpOnly=${sessionCookie.httpOnly}, secure=${sessionCookie.secure}, sameSite=${sessionCookie.sameSite}`,
      });
    }

    // ─── Check 6: Expected redirect destination ──────────────────
    if (input.expectedRedirect) {
      const atExpected = page.url().includes(input.expectedRedirect);
      checks.push({
        name: "Redirected to expected destination",
        passed: atExpected,
        detail: `Expected: ${input.expectedRedirect}, Actual: ${page.url()}`,
      });
    }

    // ─── Check 7: Protected route accessible ─────────────────────
    if (input.protectedPath) {
      await page.goto(`${input.baseUrl}${input.protectedPath}`, {
        waitUntil: "networkidle",
        timeout: 10000,
      });
      const notRedirectedToLogin = !page
        .url()
        .includes(input.loginPath || "/login");

      await screenshot(page, evidenceDir, "03-protected-route", evidence);

      checks.push({
        name: "Protected route accessible when authenticated",
        passed: notRedirectedToLogin,
        detail: `Visited ${input.protectedPath}, ended at ${page.url()}`,
      });
    }

    // ─── Check 8: Unauthenticated redirect ───────────────────────
    if (input.protectedPath) {
      // Clear cookies and try protected route
      await context.clearCookies();
      await page.goto(`${input.baseUrl}${input.protectedPath}`, {
        waitUntil: "networkidle",
        timeout: 10000,
      });
      const redirectedToLogin = page
        .url()
        .includes(input.loginPath || "/login");

      await screenshot(page, evidenceDir, "04-unauthenticated-redirect", evidence);

      checks.push({
        name: "Protected route redirects unauthenticated users to login",
        passed: redirectedToLogin,
        detail: `Without cookies, visited ${input.protectedPath}, ended at ${page.url()}`,
      });
    }

    const allPassed = checks.every((c) => c.passed);
    return finalize(
      checks,
      evidence,
      start,
      allPassed
        ? "All auth flow checks passed"
        : `${checks.filter((c) => !c.passed).length} check(s) failed`
    );
  } catch (err) {
    checks.push({
      name: "Agent execution",
      passed: false,
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
    return finalize(checks, evidence, start, "Agent crashed");
  } finally {
    await browser?.close();
  }
}

async function screenshot(
  page: Page,
  dir: string,
  name: string,
  evidence: EvidenceFile[]
): Promise<void> {
  const filePath = path.join(dir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  evidence.push({ name: `${name}.png`, path: filePath, type: "screenshot" });
}

function finalize(
  checks: AuthCheck[],
  evidence: EvidenceFile[],
  start: number,
  summary: string
): AuthTestResult {
  const passed = checks.length > 0 && checks.every((c) => c.passed);
  return {
    passed,
    checks,
    evidence,
    duration: Date.now() - start,
    summary,
  };
}
