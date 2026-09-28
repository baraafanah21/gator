import { eq, sql } from "drizzle-orm";
import { db } from "..";
import { feedFollows, feeds, posts, users } from "../schema";

export type Feed = typeof feeds.$inferSelect;
export type User = typeof users.$inferSelect;


export async function getFeeds() {
  return await db
    .select({
      feed: feeds,
      user: users,
      followerCount: sql<number>`(
        select count(*) from ${feedFollows}
        where ${feedFollows.feedId} = ${feeds.id}
      )`.mapWith(Number),
      postCount: sql<number>`(
        select count(*) from ${posts}
        where ${posts.feedId} = ${feeds.id}
      )`.mapWith(Number),
    })
    .from(feeds)
    .innerJoin(users, eq(feeds.userId, users.id))
    .orderBy(feeds.name);
}

export async function deleteFeed(feedId: string): Promise<void> {
  await db.delete(feeds).where(eq(feeds.id, feedId));
}

export async function getFeedByURL(url: string) {
  const [result] = await db
    .select()
    .from(feeds)
    .where(eq(feeds.url, url));

  return result;
}

export async function markFeedFetched(
  feedId: string,
): Promise<void> {
  const now = new Date();

  await db
    .update(feeds)
    .set({
      lastFetchedAt: now,
      updatedAt: now,
      lastFetchError: null,
      failedFetches: 0,
    })
    .where(eq(feeds.id, feedId));
}

// A failed fetch still counts as a fetch, so agg moves on to the next feed
// instead of retrying a broken one every round.
export async function markFeedFailed(
  feedId: string,
  error: string,
): Promise<void> {
  const now = new Date();

  await db
    .update(feeds)
    .set({
      lastFetchedAt: now,
      updatedAt: now,
      lastFetchError: error,
      failedFetches: sql`${feeds.failedFetches} + 1`,
    })
    .where(eq(feeds.id, feedId));
}

export async function getNextFeedToFetch() {
  const [feed] = await db
    .select()
    .from(feeds)
    .orderBy(
      sql`${feeds.lastFetchedAt} ASC NULLS FIRST`,
    )
    .limit(1);

  return feed;
}

export async function createFeed(
  name: string,
  url: string,
  userId: string,
): Promise<Feed> {
  const [result] = await db
    .insert(feeds)
    .values({
      name,
      url,
      userId,
    })
    .returning();

  return result;
}

export function printFeed(feed: Feed, user: User): void {
  console.log(`* ${feed.name}`);
  console.log(`  URL: ${feed.url}`);
  console.log(`  User: ${user.name}`);
}
