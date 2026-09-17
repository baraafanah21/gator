import { XMLParser } from "fast-xml-parser";

export type RSSFeed = {
  channel: {
    title: string;
    link: string;
    description: string;
    item: RSSItem[];
  };
};

export type RSSItem = {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
};

export async function fetchFeed(feedURL: string): Promise<RSSFeed> {
  const response = await fetch(feedURL, {
    headers: {
      "User-Agent": "gator",
    },
  });

  const xml = await response.text();

  const parser = new XMLParser({
    processEntities: false,
  });

  const parsed = parser.parse(xml);

  if (!parsed.rss || !parsed.rss.channel) {
    throw new Error("Invalid RSS feed: missing channel");
  }

  const channel = parsed.rss.channel;

  if (
    typeof channel.title !== "string" ||
    typeof channel.link !== "string" ||
    typeof channel.description !== "string"
  ) {
    throw new Error("Invalid RSS feed: missing channel metadata");
  }

  let items: unknown[] = [];

  if (channel.item !== undefined) {
    items = Array.isArray(channel.item)
      ? channel.item
      : [channel.item];
  }

  const validItems: RSSItem[] = [];

  for (const item of items) {
    if (
      typeof item !== "object" ||
      item === null
    ) {
      continue;
    }

    const rssItem = item as Record<string, unknown>;

    if (
      typeof rssItem.title !== "string" ||
      typeof rssItem.link !== "string"
    ) {
      continue;
    }

    validItems.push({
      title: rssItem.title,
      link: rssItem.link,
      description:
        typeof rssItem.description === "string"
          ? rssItem.description
          : undefined,
      pubDate:
        typeof rssItem.pubDate === "string"
          ? rssItem.pubDate
          : undefined,
    });
  }

  return {
    channel: {
      title: channel.title,
      link: channel.link,
      description: channel.description,
      item: validItems,
    },
  };
}
