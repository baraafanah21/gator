import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "..";
import { feedFollows, feeds, postStates, posts } from "../schema";

export type NewPost = typeof posts.$inferInsert;

export type BrowseOptions = {
  limit: number;
  offset?: number;
  feedName?: string;
  search?: string;
  since?: Date;
  unreadOnly?: boolean;
  bookmarkedOnly?: boolean;
};

export async function createPost(post: NewPost) {
  // A feed is scraped repeatedly, so posts we already saved are skipped.
  const [result] = await db
    .insert(posts)
    .values(post)
    .onConflictDoNothing({ target: posts.url })
    .returning();

  return result;
}

export async function getPostByURL(url: string) {
  const [result] = await db.select().from(posts).where(eq(posts.url, url));

  return result;
}

export async function getPostsForUser(userId: string, options: BrowseOptions) {
  const conditions: SQL[] = [eq(feedFollows.userId, userId)];

  if (options.feedName) {
    conditions.push(ilike(feeds.name, `%${options.feedName}%`));
  }

  if (options.search) {
    const pattern = `%${options.search}%`;

    conditions.push(
      or(ilike(posts.title, pattern), ilike(posts.description, pattern))!,
    );
  }

  if (options.since) {
    // Posts without a publish date fall back to when we first saw them. The
    // bound is passed as text because a raw fragment gets no column type, and
    // the driver cannot serialise a bare Date on its own.
    conditions.push(
      sql`coalesce(${posts.publishedAt}, ${posts.createdAt}) >= ${options.since.toISOString()}::timestamp`,
    );
  }

  if (options.unreadOnly) {
    conditions.push(isNull(postStates.readAt));
  }

  if (options.bookmarkedOnly) {
    conditions.push(isNotNull(postStates.bookmarkedAt));
  }

  return await db
    .select({
      id: posts.id,
      title: posts.title,
      url: posts.url,
      description: posts.description,
      publishedAt: posts.publishedAt,
      createdAt: posts.createdAt,
      feedName: feeds.name,
      readAt: postStates.readAt,
      bookmarkedAt: postStates.bookmarkedAt,
    })
    .from(posts)
    .innerJoin(feedFollows, eq(posts.feedId, feedFollows.feedId))
    .innerJoin(feeds, eq(posts.feedId, feeds.id))
    .leftJoin(
      postStates,
      and(eq(postStates.postId, posts.id), eq(postStates.userId, userId)),
    )
    .where(and(...conditions))
    .orderBy(sql`${posts.publishedAt} DESC NULLS LAST`, desc(posts.createdAt))
    .limit(options.limit)
    .offset(options.offset ?? 0);
}

export type BrowsedPost = Awaited<ReturnType<typeof getPostsForUser>>[number];
