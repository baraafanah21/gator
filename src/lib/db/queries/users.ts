import { db } from "..";
import { users } from "../schema";
import { eq } from "drizzle-orm";

export type User = typeof users.$inferSelect;

export async function createUser(name: string) {
  const [result] = await db
    .insert(users)
    .values({ name })
    .returning();

  return result;
}

export async function getUserByName(name: string) {
  const [result] = await db
    .select()
    .from(users)
    .where(eq(users.name, name));

  return result;
}

export async function deleteAllUsers(): Promise<void> {
  await db.delete(users);
}


export async function getUsers() {
  return await db.select().from(users);
}
