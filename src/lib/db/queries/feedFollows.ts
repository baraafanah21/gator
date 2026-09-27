import { and, eq, sql } from "drizzle-orm";
import { db } from "..";
import { feedFollows, feeds, postStates, posts, users } from "../schema";

// Following a feed twice is not an error, it just changes nothing. `alreadyFollowed`
// says which of the two happened so callers can report it.
export async function createFeedFollow(userId: string, feedId: string) {
  const [newFeedFollow] = await db
    .insert(feedFollows)
    .values({ userId, feedId })
    .onConflictDoNothing({
      target: [feedFollows.userId, feedFollows.feedId],
    })
    .returning();

  const [result] = await db
    .select({
      id: feedFollows.id,
      createdAt: feedFollows.createdAt,
      updatedAt: feedFollows.updatedAt,
      userId: feedFollows.userId,
      feedId: feedFollows.feedId,
      userName: users.name,
      feedName: feeds.name,
    })
    .from(feedFollows)
    .innerJoin(users, eq(feedFollows.userId, users.id))
    .innerJoin(feeds, eq(feedFollows.feedId, feeds.id))
    .where(
      and(eq(feedFollows.userId, userId), eq(feedFollows.feedId, feedId)),
    );

  return { ...result, alreadyFollowed: newFeedFollow === undefined };
}

export async function getFollowedFeeds(userId: string) {
  return await db
    .select({ name: feeds.name, url: feeds.url })
    .from(feedFollows)
    .innerJoin(feeds, eq(feedFollows.feedId, feeds.id))
    .where(eq(feedFollows.userId, userId))
    .orderBy(feeds.name);
}

export async function getFeedsFollowedBy(userId: string) {
  const rows = await db
    .select({ feed: feeds })
    .from(feedFollows)
    .innerJoin(feeds, eq(feedFollows.feedId, feeds.id))
    .where(eq(feedFollows.userId, userId))
    .orderBy(feeds.name);

  return rows.map(({ feed }) => feed);
}

// Unread is per user: a post counts until this user has a read time for it.
export async function getFollowedFeedsWithCounts(userId: string) {
  return await db
    .select({
      feed: feeds,
      postCount: sql<number>`(
        select count(*) from ${posts}
        where ${posts.feedId} = ${feeds.id}
      )`.mapWith(Number),
      unreadCount: sql<number>`(
        select count(*) from ${posts}
        left join ${postStates}
          on ${postStates.postId} = ${posts.id}
          and ${postStates.userId} = ${userId}
        where ${posts.feedId} = ${feeds.id}
          and ${postStates.readAt} is null
      )`.mapWith(Number),
    })
    .from(feedFollows)
    .innerJoin(feeds, eq(feedFollows.feedId, feeds.id))
    .where(eq(feedFollows.userId, userId))
    .orderBy(feeds.name);
}

export async function getFeedFollowsForUser(userId: string) {
  return await db
    .select({
      id: feedFollows.id,
      createdAt: feedFollows.createdAt,
      updatedAt: feedFollows.updatedAt,
      userId: feedFollows.userId,
      feedId: feedFollows.feedId,
      userName: users.name,
      feedName: feeds.name,
    })
    .from(feedFollows)
    .innerJoin(users, eq(feedFollows.userId, users.id))
    .innerJoin(feeds, eq(feedFollows.feedId, feeds.id))
    .where(eq(feedFollows.userId, userId));
}

export async function deleteFeedFollow(
  userId: string,
  feedId: string,
): Promise<void> {
  await db
    .delete(feedFollows)
    .where(
      and(
        eq(feedFollows.userId, userId),
        eq(feedFollows.feedId, feedId),
      ),
    );
}
