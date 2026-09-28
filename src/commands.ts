import fs from "fs";

import { fetchFeed, type RSSFeed } from "./rss.js";
import { buildOPML, parseOPML } from "./opml.js";
import { deleteAllUsers } from "./lib/db/queries/users.js";
import { setUser, readConfig } from "./config.js";
import {
  flagBool,
  flagString,
  nonNegativeInt,
  parseDuration,
  parseFlags,
  positiveInt,
} from "./args.js";
import { usageError } from "./help.js";
import {
  createUser,
  getUserByName,
  getUsers,
  type User,
} from "./lib/db/queries/users.js";
import {
  createFeed,
  deleteFeed,
  getFeedByURL,
  getFeeds,
  getNextFeedToFetch,
  markFeedFailed,
  markFeedFetched,
  printFeed,
  type Feed,
} from "./lib/db/queries/feeds.js";
import {
  createFeedFollow,
  deleteFeedFollow,
  getFeedsFollowedBy,
  getFollowedFeedsWithCounts,
  getFollowedFeeds,
} from "./lib/db/queries/feedFollows.js";
import {
  createPost,
  getPostByURL,
  getPostsForUser,
  type BrowseOptions,
  type BrowsedPost,
} from "./lib/db/queries/posts.js";
import {
  markAllPostsRead,
  setPostBookmarked,
  setPostRead,
} from "./lib/db/queries/postStates.js";

export type CommandHandler = (
  cmdName: string,
  ...args: string[]
) => Promise<void>;

export type CommandsRegistry = Record<string, CommandHandler>;

export function registerCommand(
  registry: CommandsRegistry,
  cmdName: string,
  handler: CommandHandler,
): void {
  registry[cmdName] = handler;
}

export async function runCommand(
  registry: CommandsRegistry,
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const handler = registry[cmdName];

  if (handler === undefined) {
    throw new Error(
      `Unknown command: ${cmdName}\nRun 'help' to list commands.`,
    );
  }

  await handler(cmdName, ...args);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function handlerLogin(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length !== 1) {
    throw usageError(cmdName, "login takes exactly one username");
  }

  const username = args[0];

  const user = await getUserByName(username);

  if (!user) {
    throw new Error(`User ${username} does not exist`);
  }

  setUser(username);

  console.log(`User ${username} has been set`);
}

export async function handlerRegister(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length !== 1) {
    throw usageError(cmdName, "register takes exactly one username");
  }

  const username = args[0];

  const existingUser = await getUserByName(username);

  if (existingUser) {
    throw new Error(`User ${username} already exists`);
  }

  const user = await createUser(username);

  setUser(username);

  console.log(`User ${username} has been created`);
  console.log(user);
}

export async function handlerUsers(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const users = await getUsers();

  if (users.length === 0) {
    console.log("No users yet. Create one with 'register <name>'.");
    return;
  }

  const currentUser = readConfig().currentUserName;

  for (const user of users) {
    if (user.name === currentUser) {
      console.log(`* ${user.name} (current)`);
    } else {
      console.log(`* ${user.name}`);
    }
  }
}

export async function handlerReset(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  await deleteAllUsers();

  console.log("Database reset successfully");
}

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

export async function handlerAddFeed(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length !== 2) {
    throw usageError(cmdName, "addfeed takes a name and a url");
  }

  const [name, url] = args;

  const existing = await getFeedByURL(url);

  if (existing) {
    throw new Error(
      `Feed ${url} already exists as "${existing.name}". Follow it with 'follow ${url}'.`,
    );
  }

  const feed = await createFeed(name, url, user.id);

  printFeed(feed, user);

  const feedFollow = await createFeedFollow(user.id, feed.id);

  console.log(`${feedFollow.userName} is now following ${feedFollow.feedName}`);
}

export async function handlerFeeds(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const feeds = await getFeeds();

  if (feeds.length === 0) {
    console.log("No feeds yet. Add one with 'addfeed <name> <url>'.");
    return;
  }

  for (const { feed, user, followerCount, postCount } of feeds) {
    console.log(`* ${feed.name}`);
    console.log(`  URL: ${feed.url}`);
    console.log(`  User: ${user.name}`);
    console.log(
      `  Followers: ${followerCount}  Posts: ${postCount}  Last fetched: ${
        feed.lastFetchedAt ? describeTime(feed.lastFetchedAt) : "never"
      }`,
    );
    printFetchError(feed);
  }
}

function printFetchError(feed: Feed): void {
  if (feed.failedFetches === 0) {
    return;
  }

  const times = feed.failedFetches === 1 ? "once" : `${feed.failedFetches} times in a row`;

  console.log(`  Failing (${times}): ${feed.lastFetchError}`);
}

export async function handlerFollow(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length !== 1) {
    throw usageError(cmdName, "follow takes exactly one url");
  }

  const url = args[0];

  const feed = await getFeedByURL(url);

  if (!feed) {
    throw new Error(
      `Feed with url ${url} does not exist. Add it with 'addfeed <name> ${url}'.`,
    );
  }

  const feedFollow = await createFeedFollow(user.id, feed.id);

  console.log(
    feedFollow.alreadyFollowed
      ? `${feedFollow.userName} already follows ${feedFollow.feedName}`
      : `${feedFollow.userName} is now following ${feedFollow.feedName}`,
  );
}

export async function handlerExport(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  const parsed = parseFlags(args, { all: "boolean" });

  if (parsed.positional.length > 1) {
    throw usageError(cmdName, "export takes at most one file path");
  }

  const everyFeed = flagBool(parsed, "all");

  const feeds = everyFeed
    ? (await getFeeds()).map(({ feed }) => ({ name: feed.name, url: feed.url }))
    : await getFollowedFeeds(user.id);

  if (feeds.length === 0) {
    throw new Error(
      everyFeed
        ? "There are no feeds to export."
        : "You are not following any feeds, so there is nothing to export. Try 'export --all'.",
    );
  }

  const title = everyFeed ? "gator feeds" : `gator feeds for ${user.name}`;

  const opml = buildOPML(title, feeds);

  const [filePath] = parsed.positional;

  if (!filePath) {
    process.stdout.write(opml);
    return;
  }

  fs.writeFileSync(filePath, opml);

  console.log(`Exported ${feeds.length} feeds to ${filePath}`);
}

export async function handlerImport(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  const parsed = parseFlags(args, { "dry-run": "boolean" });

  if (parsed.positional.length !== 1) {
    throw usageError(cmdName, "import takes exactly one file path");
  }

  const [filePath] = parsed.positional;

  let xml: string;

  try {
    xml = fs.readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(`Could not read ${filePath}`);
  }

  const imported = parseOPML(xml);

  if (imported.length === 0) {
    console.log(`No feeds found in ${filePath}`);
    return;
  }

  const dryRun = flagBool(parsed, "dry-run");

  let added = 0;
  let followed = 0;
  let unchanged = 0;

  for (const entry of imported) {
    const existing = await getFeedByURL(entry.url);

    if (dryRun) {
      console.log(
        `${(existing ? "follow" : "add").padEnd(6)}  ${entry.name} (${entry.url})`,
      );
      continue;
    }

    const feed = existing ?? (await createFeed(entry.name, entry.url, user.id));

    if (!existing) {
      added++;
    }

    const feedFollow = await createFeedFollow(user.id, feed.id);

    if (feedFollow.alreadyFollowed) {
      unchanged++;
    } else {
      followed++;
    }
  }

  if (dryRun) {
    console.log(`${imported.length} feeds in ${filePath}, nothing written`);
    return;
  }

  console.log(
    `Imported ${imported.length} feeds: added ${added}, newly followed ${followed}, already followed ${unchanged}`,
  );
}

export async function handlerFollowing(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  const parsed = parseFlags(args, { unread: "boolean" });

  if (parsed.positional.length > 0) {
    throw usageError(cmdName, "following takes no arguments");
  }

  const followed = await getFollowedFeedsWithCounts(user.id);

  if (followed.length === 0) {
    console.log("You are not following any feeds.");
    return;
  }

  const unreadOnly = flagBool(parsed, "unread");

  const shown = unreadOnly
    ? followed.filter(({ unreadCount }) => unreadCount > 0)
    : followed;

  if (shown.length === 0) {
    console.log("Nothing unread in the feeds you follow.");
    return;
  }

  for (const { feed, postCount, unreadCount } of shown) {
    console.log(`* ${feed.name}`);
    console.log(`  URL: ${feed.url}`);
    console.log(
      `  Unread: ${unreadCount}  Posts: ${postCount}  Last fetched: ${
        feed.lastFetchedAt ? describeTime(feed.lastFetchedAt) : "never"
      }`,
    );
    printFetchError(feed);
  }

  const totalUnread = followed.reduce((sum, { unreadCount }) => sum + unreadCount, 0);

  console.log(
    `${totalUnread} unread across ${followed.length} feed${followed.length === 1 ? "" : "s"}`,
  );
}

export async function handlerUnfollow(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length !== 1) {
    throw usageError(cmdName, "unfollow takes exactly one url");
  }

  const [url] = args;

  const feed = await getFeedByURL(url);

  if (!feed) {
    throw new Error(`Feed ${url} not found`);
  }

  await deleteFeedFollow(user.id, feed.id);

  console.log(`${user.name} is no longer following ${feed.name}`);
}

export async function handlerDeleteFeed(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length !== 1) {
    throw usageError(cmdName, "deletefeed takes exactly one url");
  }

  const [url] = args;

  const feed = await getFeedByURL(url);

  if (!feed) {
    throw new Error(`Feed ${url} not found`);
  }

  if (feed.userId !== user.id) {
    throw new Error(
      `Feed ${feed.name} was added by someone else, so ${user.name} cannot delete it. Use 'unfollow ${url}' instead.`,
    );
  }

  await deleteFeed(feed.id);

  console.log(`Deleted feed ${feed.name} and every post saved from it`);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export async function scrapeFeeds(): Promise<void> {
  const feed = await getNextFeedToFetch();

  if (!feed) {
    console.log("No feeds to fetch");
    return;
  }

  await scrapeFeed(feed);
}

// Fetches one feed, saves the posts we have not seen, and returns how many
// were new.
async function scrapeFeed(feed: Feed): Promise<number> {
  console.log(`Fetching feed: ${feed.name}`);

  let rssFeed: RSSFeed;

  try {
    rssFeed = await fetchFeed(feed.url);
  } catch (err) {
    await markFeedFailed(feed.id, err instanceof Error ? err.message : String(err));
    throw err;
  }

  await markFeedFetched(feed.id);

  let saved = 0;

  for (const item of rssFeed.channel.item) {
    const post = await createPost({
      title: item.title,
      url: item.link,
      description: item.description ?? null,
      publishedAt: parsePublishedAt(item.pubDate),
      feedId: feed.id,
    });

    if (post) {
      saved++;
    }
  }

  console.log(
    `Saved ${saved} new posts from ${feed.name} (${rssFeed.channel.item.length} in feed)`,
  );

  return saved;
}

// A one-off fetch, for when you want posts now rather than waiting for agg to
// work its way round to a feed.
export async function handlerFetch(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length > 1) {
    throw usageError(cmdName, "fetch takes at most one feed url");
  }

  const [url] = args;

  let feeds: Feed[];

  if (url) {
    const feed = await getFeedByURL(url);

    if (!feed) {
      throw new Error(
        `Feed ${url} not found. Add it with 'addfeed <name> ${url}'.`,
      );
    }

    feeds = [feed];
  } else {
    feeds = await getFeedsFollowedBy(user.id);

    if (feeds.length === 0) {
      console.log("You are not following any feeds, so there is nothing to fetch.");
      return;
    }
  }

  let saved = 0;
  const failed: string[] = [];

  for (const feed of feeds) {
    try {
      saved += await scrapeFeed(feed);
    } catch (err) {
      handleError(err);
      failed.push(feed.name);
    }
  }

  if (feeds.length > 1) {
    console.log(
      `Fetched ${feeds.length - failed.length} of ${feeds.length} feeds, saved ${saved} new posts`,
    );
  }

  if (failed.length > 0) {
    throw new Error(`Could not fetch: ${failed.join(", ")}`);
  }
}

function parsePublishedAt(pubDate: string | undefined): Date | null {
  if (!pubDate) {
    return null;
  }

  // Handles RFC 822 ("Mon, 02 Jan 2006 15:04:05 GMT") and ISO 8601.
  const date = new Date(pubDate.trim());

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function handleError(err: unknown): void {
  console.error(err instanceof Error ? err.message : err);
}

export async function handlerAgg(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const parsed = parseFlags(args, { limit: "string" });

  if (parsed.positional.length !== 1) {
    throw usageError(cmdName, "agg requires a time between requests, e.g. 1m");
  }

  const timeBetweenRequests = parseDuration(parsed.positional[0]);

  const limitFlag = flagString(parsed, "limit");
  const rounds = limitFlag ? positiveInt(limitFlag, "--limit") : undefined;

  console.log(
    rounds
      ? `Collecting feeds every ${parsed.positional[0]}, ${rounds} times`
      : `Collecting feeds every ${parsed.positional[0]}`,
  );

  let done = 0;

  await new Promise<void>((resolve) => {
    const stop = () => {
      clearInterval(interval);
      process.off("SIGINT", onSigint);
      resolve();
    };

    const onSigint = () => {
      console.log("Shutting down feed aggregator...");
      stop();
    };

    const round = () => {
      scrapeFeeds()
        .catch(handleError)
        .finally(() => {
          done++;

          if (rounds !== undefined && done >= rounds) {
            stop();
          }
        });
    };

    const interval = setInterval(round, timeBetweenRequests);

    process.on("SIGINT", onSigint);

    round();
  });
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

const BROWSE_FLAGS = {
  limit: "string",
  offset: "string",
  feed: "string",
  search: "string",
  since: "string",
  unread: "boolean",
  bookmarked: "boolean",
  full: "boolean",
  "mark-read": "boolean",
} as const;

export async function handlerBrowse(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  await browse(cmdName, user, args, false);
}

export async function handlerBookmarks(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  await browse(cmdName, user, args, true);
}

async function browse(
  cmdName: string,
  user: User,
  args: string[],
  bookmarkedOnly: boolean,
): Promise<void> {
  const parsed = parseFlags(args, { ...BROWSE_FLAGS });

  if (parsed.positional.length > 1) {
    throw usageError(cmdName, `${cmdName} takes at most one limit`);
  }

  const limitArg = flagString(parsed, "limit") ?? parsed.positional[0];
  const offsetArg = flagString(parsed, "offset");
  const sinceArg = flagString(parsed, "since");

  const options: BrowseOptions = {
    limit: limitArg ? positiveInt(limitArg, "limit") : 2,
    offset: offsetArg ? nonNegativeInt(offsetArg, "--offset") : 0,
    feedName: flagString(parsed, "feed"),
    search: flagString(parsed, "search"),
    since: sinceArg ? new Date(Date.now() - parseDuration(sinceArg)) : undefined,
    unreadOnly: flagBool(parsed, "unread"),
    bookmarkedOnly: bookmarkedOnly || flagBool(parsed, "bookmarked"),
  };

  const posts = await getPostsForUser(user.id, options);

  if (posts.length === 0) {
    console.log(
      options.bookmarkedOnly
        ? "No bookmarked posts match."
        : "No posts match. Try 'fetch' to collect some, or widen your filters.",
    );
    return;
  }

  const full = flagBool(parsed, "full");

  for (const post of posts) {
    printPost(post, full);
  }

  if (flagBool(parsed, "mark-read")) {
    for (const post of posts) {
      await setPostRead(user.id, post.id, true);
    }

    console.log(`Marked ${posts.length} posts read`);
  }

  if (posts.length === options.limit) {
    const nextOffset = (options.offset ?? 0) + options.limit;

    console.log(`More posts may be available: add --offset ${nextOffset}`);
  }
}

function printPost(post: BrowsedPost, full: boolean): void {
  const labels: string[] = [];

  labels.push(post.readAt ? "read" : "unread");

  if (post.bookmarkedAt) {
    labels.push("bookmarked");
  }

  console.log(`* ${post.title}`);
  console.log(`  Feed: ${post.feedName}`);
  console.log(
    `  Published: ${
      post.publishedAt
        ? `${post.publishedAt.toISOString()} (${describeTime(post.publishedAt)})`
        : "unknown"
    }`,
  );
  console.log(`  URL: ${post.url}`);
  console.log(`  Status: ${labels.join(", ")}`);

  const description = cleanDescription(post.description);

  if (description) {
    console.log(`  ${full ? description : truncate(description, 200)}`);
  }
}

export async function handlerBookmark(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  const post = await requirePost(cmdName, "bookmark", args);

  await setPostBookmarked(user.id, post.id, true);

  console.log(`Bookmarked: ${post.title}`);
}

export async function handlerUnbookmark(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  const post = await requirePost(cmdName, "unbookmark", args);

  await setPostBookmarked(user.id, post.id, false);

  console.log(`Removed bookmark: ${post.title}`);
}

export async function handlerMarkRead(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  const parsed = parseFlags(args, { all: "boolean" });

  if (flagBool(parsed, "all")) {
    if (parsed.positional.length > 0) {
      throw usageError(cmdName, "markread --all takes no url");
    }

    const count = await markAllPostsRead(user.id);

    console.log(`Marked ${count} posts read`);
    return;
  }

  const post = await requirePost(cmdName, "markread", parsed.positional);

  await setPostRead(user.id, post.id, true);

  console.log(`Marked read: ${post.title}`);
}

export async function handlerMarkUnread(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  const post = await requirePost(cmdName, "markunread", args);

  await setPostRead(user.id, post.id, false);

  console.log(`Marked unread: ${post.title}`);
}

async function requirePost(cmdName: string, label: string, args: string[]) {
  if (args.length !== 1) {
    throw usageError(cmdName, `${label} takes exactly one post url`);
  }

  const url = args[0];

  const post = await getPostByURL(url);

  if (!post) {
    throw new Error(
      `No saved post with url ${url}. Run 'browse' to see the urls gator knows about.`,
    );
  }

  return post;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function describeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 0) {
    return "in the future";
  }

  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [52, "week"],
  ];

  let amount = seconds;

  for (const [size, name] of units) {
    if (amount < size) {
      return `${amount} ${name}${amount === 1 ? "" : "s"} ago`;
    }

    amount = Math.floor(amount / size);
  }

  return `${amount} year${amount === 1 ? "" : "s"} ago`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (!body.startsWith("#")) {
      return ENTITIES[body.toLowerCase()] ?? entity;
    }

    const code = body[1] === "x" || body[1] === "X"
      ? Number.parseInt(body.slice(2), 16)
      : Number(body.slice(1));

    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
      return entity;
    }

    return String.fromCodePoint(code);
  });
}

// Feed descriptions are HTML, which reads badly in a terminal. The HTML is
// itself escaped inside the XML, so it has to be decoded before the tags are
// there to strip, and decoded again for entities in the text they contained.
function cleanDescription(description: string | null): string {
  if (!description) {
    return "";
  }

  const html = decodeEntities(description);

  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ");

  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
