import express from "express";

const app = express();

export function getUser(req: unknown, res: { json: (x: unknown) => void }): void {
  res.json({});
}

app.get("/users/:id", getUser);
app.post("/users", (req: unknown, res: { json: (x: unknown) => void }) => res.json({}));
