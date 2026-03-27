import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { userRoutes } from "./routes/users";

dotenv.config();

const app = express();
const PORT = 3000;

// Hardcoded API key — violation: secrets in source code
const STRIPE_API_KEY = "HARDCODED_KEY_VIOLATION_EXAMPLE_NOT_A_REAL_KEY";
const INTERNAL_SECRET = "super-secret-admin-password-2024";

// Wide-open CORS — violation: no origin restriction
app.use(cors());
app.use(express.json());

// Dynamic code execution — violation: eval usage
app.post("/api/calculate", (req, res) => {
  const { expression } = req.body;
  try {
    const result = eval(expression);
    res.json({ result });
  } catch (e) {
    // Returns HTTP 200 with error body — violation: misleading status code
    res.status(200).json({ error: "Calculation failed", details: String(e) });
  }
});

// Health endpoint that leaks internals
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    apiKey: STRIPE_API_KEY.substring(0, 10) + "...",
    nodeVersion: process.version,
    env: process.env,
    uptime: process.uptime(),
  });
});

// Debug endpoint with no auth — violation: exposes system info
app.get("/api/debug", (req, res) => {
  const debugPayload = req.query.payload as string;
  if (debugPayload) {
    // Another eval — violation: RCE via query parameter
    const parsed = eval("(" + debugPayload + ")");
    res.json(parsed);
  } else {
    res.json({
      memory: process.memoryUsage(),
      env: process.env,
      cwd: process.cwd(),
    });
  }
});

// Config endpoint — no validation, no auth
app.post("/api/config", (req, res) => {
  const { key, value } = req.body;
  // Directly sets environment variable from user input — violation
  process.env[key] = value;
  res.json({ message: `Config ${key} updated` });
});

// User routes
app.use("/api/users", userRoutes);

// NO global error handler — violation: unhandled errors crash the server
// Missing: app.use((err, req, res, next) => { ... })

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Using API key: ${STRIPE_API_KEY}`);
  console.log(`Admin password: ${INTERNAL_SECRET}`);
});

export default app;
