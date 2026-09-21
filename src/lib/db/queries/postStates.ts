import { and, eq, sql } from "drizzle-orm";
import { db } from "..";
import { postStates } from "../schema";

async function setState(
  userId: string,
  postId: string,
  values: { readAt?: Date | null; bookmarkedAt?: Date | null },
) {
  const [result] = await db
    .insert(postStates)
    .values({ userId, postId, ...values })
    .onConflictDoUpdate({
      target: [postStates.userId, postStates.postId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  return result;
}

export async function setPostRead(userId: string, postId: string, read: boolean) {
  return await setState(userId, postId, { readAt: read ? new Date() : null });
}

export async function setPostBookmarked(
  userId: string,
  postId: string,
  bookmarked: boolean,
) {
  return await setState(userId, postId, {
    bookmarkedAt: bookmarked ? new Date() : null,
  });
}

export async function getPostState(userId: string, postId: string) {
  const [result] = await db
    .select()
    .from(postStates)
    .where(and(eq(postStates.userId, userId), eq(postStates.postId, postId)));

  return result;
}

// Marks every post from the feeds a user follows as read, and reports how many
// were not already read. Posts that already have a read time keep it.
export async function markAllPostsRead(userId: string): Promise<number> {
  const rows = await db.execute(sql`
    insert into post_states (user_id, post_id, read_at)
    select ${userId}::uuid, p.id, now()
    from posts p
    join feed_follows ff
      on ff.feed_id = p.feed_id and ff.user_id = ${userId}::uuid
    on conflict (user_id, post_id) do update
      set read_at = excluded.read_at, updated_at = now()
      where post_states.read_at is null
    returning post_states.id
  `);

  return rows.length;
}
