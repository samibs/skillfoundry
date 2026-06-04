import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id"),
  email: varchar("email", { length: 255 }),
});
