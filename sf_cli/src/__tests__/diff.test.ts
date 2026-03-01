import { describe, it, expect } from 'vitest';
import { parseDiff } from '../components/DiffPreview.js';

const SAMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
index abc1234..def5678 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,7 +10,8 @@ import { config } from './config';
 const app = express();

-app.use(cors());
+app.use(cors({ origin: 'http://localhost:3000' }));
+app.use(helmet());

 app.listen(3000);
diff --git a/src/routes.ts b/src/routes.ts
new file mode 100644
--- /dev/null
+++ b/src/routes.ts
@@ -0,0 +1,5 @@
+import { Router } from 'express';
+
+const router = Router();
+
+export default router;`;

describe('parseDiff', () => {
  it('should parse multiple files from a diff', () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files).toHaveLength(2);
    expect(files[0].fileName).toBe('src/app.ts');
    expect(files[1].fileName).toBe('src/routes.ts');
  });

  it('should identify additions and removals', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const appDiff = files[0];
    const adds = appDiff.lines.filter((l) => l.type === 'add');
    const removes = appDiff.lines.filter((l) => l.type === 'remove');
    expect(adds.length).toBe(2);
    expect(removes.length).toBe(1);
  });

  it('should identify context lines', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const context = files[0].lines.filter((l) => l.type === 'context');
    expect(context.length).toBeGreaterThan(0);
  });

  it('should identify header lines', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const headers = files[0].lines.filter((l) => l.type === 'header');
    expect(headers.length).toBe(1);
    expect(headers[0].content).toContain('@@');
  });

  it('should handle empty diff', () => {
    const files = parseDiff('');
    expect(files).toHaveLength(0);
  });

  it('should parse added content correctly', () => {
    const files = parseDiff(SAMPLE_DIFF);
    const routesDiff = files[1];
    const adds = routesDiff.lines.filter((l) => l.type === 'add');
    expect(adds.length).toBe(5);
    expect(adds[0].content).toContain("import { Router }");
  });
});
