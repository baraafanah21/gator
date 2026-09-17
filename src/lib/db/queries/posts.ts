import { desc, eq, sql } from "drizzle-orm";
import { db } from "..";
import { feedFollows, feeds, posts } from "../schema";

export type NewPost = typeof posts.$inferInsert;

export async function createPost(post: NewPost) {
  // A feed is scraped repeatedly, so posts we already saved are skipped.
  const [result] = await db
    .insert(posts)
    .values(post)
    .onConflictDoNothing({ target: posts.url })
    .returning();

  return result;
}

export async function getPostsForUser(userId: string, limit: number) {
  return await db
    .select({
      id: posts.id,
      title: posts.title,
      url: posts.url,
      description: posts.description,
      publishedAt: posts.publishedAt,
      feedName: feeds.name,
    })
    .from(posts)
    .innerJoin(feedFollows, eq(posts.feedId, feedFollows.feedId))
    .innerJoin(feeds, eq(posts.feedId, feeds.id))
    .where(eq(feedFollows.userId, userId))
    .orderBy(
      sql`${posts.publishedAt} DESC NULLS LAST`,
      desc(posts.createdAt),
    )
    .limit(limit);
}
