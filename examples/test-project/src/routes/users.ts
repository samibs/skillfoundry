import { Router, Request, Response } from "express";

const router = Router();

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  passwordHash: string;
}

// Fake in-memory database
const users: User[] = [
  { id: 1, name: "Alice Admin", email: "alice@example.com", role: "admin", passwordHash: "hashed_pw_1" },
  { id: 2, name: "Bob User", email: "bob@example.com", role: "user", passwordHash: "hashed_pw_2" },
  { id: 3, name: "Charlie User", email: "charlie@example.com", role: "user", passwordHash: "hashed_pw_3" },
];

// GET all users — violation: no pagination, leaks password hashes
router.get("/", (req: Request, res: Response) => {
  res.json(users);
});

// GET user by ID — violation: no ownership check, any user can access any other user
router.get("/:id", (req: Request, res: Response) => {
  const user = users.find((u) => u.id === parseInt(req.params.id));
  if (!user) {
    // Returns 200 with error — violation: wrong status code
    res.status(200).json({ error: "User not found" });
    return;
  }
  // Leaks passwordHash — violation: sensitive data exposure
  res.json(user);
});

// Admin route — violation: no role/auth check at all
router.delete("/admin/purge", (req: Request, res: Response) => {
  // Anyone can call this — no authentication, no authorization
  users.length = 0;
  res.json({ message: "All users purged", count: 0 });
});

// Admin stats — violation: no role check
router.get("/admin/stats", (req: Request, res: Response) => {
  res.json({
    totalUsers: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    // Leaks internal structure
    rawData: users,
  });
});

// Update user — violation: no ownership check, no input validation
router.put("/:id", (req: Request, res: Response) => {
  const userId = parseInt(req.params.id);
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Directly spreads user input — violation: mass assignment
  users[index] = { ...users[index], ...req.body };
  res.json(users[index]);
});

// Search users — violation: builds query from raw input (simulated SQL injection pattern)
router.get("/search/:query", (req: Request, res: Response) => {
  const query = req.params.query;
  // Simulated unsafe query construction
  const sqlQuery = `SELECT * FROM users WHERE name LIKE '%${query}%' OR email LIKE '%${query}%'`;
  console.log("Executing:", sqlQuery);
  // For demo, just filter in memory
  const results = users.filter(
    (u) => u.name.includes(query) || u.email.includes(query)
  );
  res.json(results);
});

// External API call — violation: fetch without try/catch
router.get("/:id/external-profile", async (req: Request, res: Response) => {
  const userId = req.params.id;
  // No try/catch — unhandled rejection if fetch fails
  const response = await fetch(`https://api.example.com/profiles/${userId}`);
  const data = await response.json();
  // No response status check either
  res.json(data);
});

// Login — violation: timing-safe comparison not used, logs credentials
router.post("/login", (req: Request, res: Response) => {
  const { email, password } = req.body;
  console.log(`Login attempt: ${email} / ${password}`);

  const user = users.find((u) => u.email === email);
  if (!user) {
    res.json({ success: false, message: "Invalid credentials" });
    return;
  }

  // Hardcoded JWT secret — violation
  const jwt = require("jsonwebtoken");
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    "HARDCODED_JWT_SECRET_VIOLATION_EXAMPLE",
    { expiresIn: "30d" } // violation: token lives too long
  );

  // Returns token in body — violation: should be HttpOnly cookie
  res.json({
    success: true,
    token,
    user: { id: user.id, name: user.name, role: user.role },
  });
});

// Delete account — violation: no confirmation, no auth, empty catch
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const index = users.findIndex((u) => u.id === userId);
    if (index !== -1) {
      users.splice(index, 1);
    }
    // Calls external service without error handling
    await fetch(`https://api.example.com/audit/delete/${userId}`, {
      method: "POST",
    });
    res.json({ deleted: true });
  } catch (e) {
    // Empty catch block — violation: silent failure
  }
});

export { router as userRoutes };
