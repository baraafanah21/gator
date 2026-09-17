import { fetchFeed } from "./rss.js";
import { deleteAllUsers } from "./lib/db/queries/users.js";
import { setUser,readConfig } from "./config.js";
import {
  createUser,
  getUserByName,
  getUsers,
  type User,
} from "./lib/db/queries/users.js";
import {
  createFeed,
  getFeedByURL,
  getFeeds,
  getNextFeedToFetch,
  markFeedFetched,
  printFeed,
} from "./lib/db/queries/feeds.js";
import {
  createFeedFollow,
  deleteFeedFollow,
  getFeedFollowsForUser,
} from "./lib/db/queries/feedFollows.js";
import {
  createPost,
  getPostsForUser,
} from "./lib/db/queries/posts.js";

export type CommandHandler = (
  cmdName: string,
  ...args: string[]
) => Promise<void>;

export type CommandsRegistry = Record<string, CommandHandler>;

export async function handlerLogin(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length === 0) {
    throw new Error("username is required");
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
  if (args.length === 0) {
    throw new Error("username is required");
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
    throw new Error(`Unknown command: ${cmdName}`);
  }

  await handler(cmdName, ...args);
}

export async function handlerReset(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  await deleteAllUsers();

  console.log("Database reset successfully");
}

export async function handlerUsers(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const users = await getUsers();
  const currentUser = readConfig().currentUserName;

  for (const user of users) {
    if (user.name === currentUser) {
      console.log(`* ${user.name} (current)`);
    } else {
      console.log(`* ${user.name}`);
    }
  }
}

function parseDuration(durationStr: string): number {
  const regex = /^(\d+)(ms|s|m|h)$/;
  const match = durationStr.match(regex);

  if (!match) {
    throw new Error(
      "Invalid duration format",
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case "ms":
      return amount;

    case "s":
      return amount * 1000;

    case "m":
      return amount * 60 * 1000;

    case "h":
      return amount * 60 * 60 * 1000;

    default:
      throw new Error("Invalid duration unit");
  }
}

export async function scrapeFeeds(): Promise<void> {
  const feed = await getNextFeedToFetch();

  if (!feed) {
    console.log("No feeds to fetch");
    return;
  }

  console.log(`Fetching feed: ${feed.name}`);

  const rssFeed = await fetchFeed(feed.url);

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
  console.error(err);
}

export async function handlerAgg(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length !== 1) {
    throw new Error("agg requires a time between requests, e.g. 1m");
  }

  const timeBetweenRequests = parseDuration(args[0]);

  console.log(`Collecting feeds every ${args[0]}`);

  scrapeFeeds().catch(handleError);

  const interval = setInterval(() => {
    scrapeFeeds().catch(handleError);
  }, timeBetweenRequests);

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      console.log(
        "Shutting down feed aggregator...",
      );

      clearInterval(interval);

      resolve();
    });
  });
}

export async function handlerAddFeed(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length < 2) {
    throw new Error("name and url are required");
  }

  const name = args[0];
  const url = args[1];

  const feed = await createFeed(name, url, user.id);

  printFeed(feed, user);

  const feedFollow = await createFeedFollow(user.id, feed.id);

  console.log(
    `${feedFollow.userName} is now following ${feedFollow.feedName}`,
  );
}

export async function handlerFollow(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length < 1) {
    throw new Error("url is required");
  }

  const url = args[0];

  const feed = await getFeedByURL(url);

  if (!feed) {
    throw new Error(`Feed with url ${url} does not exist`);
  }

  const feedFollow = await createFeedFollow(user.id, feed.id);

  console.log(
    `${feedFollow.userName} is now following ${feedFollow.feedName}`,
  );
}

export async function handlerFollowing(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  const feedFollows = await getFeedFollowsForUser(user.id);

  for (const feedFollow of feedFollows) {
    console.log(`* ${feedFollow.feedName}`);
  }
}

export async function handlerBrowse(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  let limit = 2;

  if (args.length > 0) {
    limit = Number(args[0]);

    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("limit must be a positive integer");
    }
  }

  const posts = await getPostsForUser(user.id, limit);

  for (const post of posts) {
    console.log(`* ${post.title}`);
    console.log(`  Feed: ${post.feedName}`);
    console.log(
      `  Published: ${post.publishedAt ? post.publishedAt.toISOString() : "unknown"}`,
    );
    console.log(`  URL: ${post.url}`);
  }
}

export async function handlerUnfollow(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length !== 1) {
    throw new Error("unfollow requires a URL");
  }

  const [url] = args;

  const feed = await getFeedByURL(url);

  if (!feed) {
    throw new Error(`Feed ${url} not found`);
  }

  await deleteFeedFollow(user.id, feed.id);
}

export async function handlerFeeds(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const feeds = await getFeeds();

  for (const feed of feeds) {
    printFeed(feed.feed, feed.user);
  }
}
