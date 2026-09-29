import type { CommandHandler, CommandsRegistry } from "./commands.js";

export type CommandHelp = {
  usage: string;
  summary: string;
  group: string;
  requiresLogin?: boolean;
  details?: string[];
};

const GROUP_ORDER = ["Users", "Feeds", "Posts", "Maintenance"];

export const commandHelp: Record<string, CommandHelp> = {
  register: {
    usage: "register <name>",
    summary: "Create a user and log in as them.",
    group: "Users",
  },
  login: {
    usage: "login <name>",
    summary: "Switch to an existing user.",
    group: "Users",
  },
  users: {
    usage: "users",
    summary: "List all users. The current one is marked (current).",
    group: "Users",
  },
  addfeed: {
    usage: "addfeed [name] <url> [--no-check]",
    summary: "Add an RSS or Atom feed and follow it.",
    group: "Feeds",
    requiresLogin: true,
    details: [
      "The url is fetched first, so a typo or a dead feed is caught straight away.",
      "Give a site's home page and the feed it links to is found and added instead.",
      "Leave out the name to use the feed's own title.",
      "--no-check  add the url as given without fetching it. Needs a name.",
    ],
  },
  feeds: {
    usage: "feeds",
    summary: "List every feed with its owner, followers and post count.",
    group: "Feeds",
    details: [
      "A feed whose last fetch failed shows the error and how many times in a row.",
    ],
  },
  follow: {
    usage: "follow <url>",
    summary: "Follow a feed someone has already added.",
    group: "Feeds",
    requiresLogin: true,
  },
  following: {
    usage: "following [--unread]",
    summary: "List the feeds you follow, with unread and post counts.",
    group: "Feeds",
    requiresLogin: true,
    details: [
      "Unread counts are yours alone; markread and browse --mark-read lower them.",
      "--unread  only list feeds that have posts you have not read.",
    ],
  },
  unfollow: {
    usage: "unfollow <url>",
    summary: "Stop following a feed.",
    group: "Feeds",
    requiresLogin: true,
  },
  import: {
    usage: "import <file> [--dry-run]",
    summary: "Add and follow every feed in an OPML file.",
    group: "Feeds",
    requiresLogin: true,
    details: [
      "OPML is what other feed readers export, so this moves a reading list in.",
      "Feeds gator already knows are followed rather than added twice.",
      "--dry-run  list what would happen without writing anything.",
    ],
  },
  export: {
    usage: "export [file] [--all]",
    summary: "Write the feeds you follow as OPML.",
    group: "Feeds",
    requiresLogin: true,
    details: [
      "Without a file path the OPML goes to stdout, so it can be piped.",
      "--all  export every feed in the database, not just the ones you follow.",
    ],
  },
  deletefeed: {
    usage: "deletefeed <url>",
    summary: "Delete a feed you added, with its posts and follows.",
    group: "Feeds",
    requiresLogin: true,
    details: [
      "Only the user who added the feed can delete it.",
      "Every post saved from the feed is deleted too. This cannot be undone.",
    ],
  },
  agg: {
    usage: "agg <interval> [--limit <n>]",
    summary: "Keep fetching feeds, one per interval, saving new posts.",
    group: "Posts",
    details: [
      "The interval is a number followed by ms, s, m, h or d, e.g. 30s or 1m.",
      "Use a minute or more so you do not overload the sites you fetch from.",
      "--limit <n>  stop after n rounds instead of running until Ctrl+C.",
      "Runs until you press Ctrl+C when no limit is given.",
    ],
  },
  fetch: {
    usage: "fetch [url]",
    summary: "Fetch every feed you follow once, or just one feed, now.",
    group: "Posts",
    requiresLogin: true,
    details: [
      "Unlike agg, this fetches straight away and then exits.",
      "A feed that fails is reported and skipped; the rest are still fetched.",
    ],
  },
  browse: {
    usage: "browse [limit] [flags]",
    summary: "Show the newest posts from feeds you follow.",
    group: "Posts",
    requiresLogin: true,
    details: [
      "--limit <n>      how many posts to show (default 2).",
      "--offset <n>     skip the first n posts, for paging through results.",
      "--feed <name>    only posts from feeds whose name contains <name>.",
      "--search <term>  only posts whose title or description contains <term>.",
      "--since <age>    only posts newer than an age such as 2d or 12h.",
      "--unread         only posts you have not marked read.",
      "--bookmarked     only posts you have bookmarked.",
      "--full           show the whole description instead of a short preview.",
      "--mark-read      mark every post shown as read.",
      "A bare number works too: browse 10 is the same as browse --limit 10.",
    ],
  },
  bookmarks: {
    usage: "bookmarks [limit] [flags]",
    summary: "Show your bookmarked posts.",
    group: "Posts",
    requiresLogin: true,
    details: ["Takes the same flags as browse, with --bookmarked always on."],
  },
  bookmark: {
    usage: "bookmark <url>",
    summary: "Bookmark a post by its URL.",
    group: "Posts",
    requiresLogin: true,
  },
  unbookmark: {
    usage: "unbookmark <url>",
    summary: "Remove a bookmark.",
    group: "Posts",
    requiresLogin: true,
  },
  markread: {
    usage: "markread <url> | markread --all",
    summary: "Mark a post read, or every post from feeds you follow.",
    group: "Posts",
    requiresLogin: true,
  },
  markunread: {
    usage: "markunread <url>",
    summary: "Mark a post unread again.",
    group: "Posts",
    requiresLogin: true,
  },
  help: {
    usage: "help [command]",
    summary: "Show this help, or details for one command.",
    group: "Maintenance",
  },
  reset: {
    usage: "reset",
    summary: "Delete all users, and their feeds, follows and posts.",
    group: "Maintenance",
  },
};

export function usageFor(cmdName: string): string {
  return commandHelp[cmdName]?.usage ?? cmdName;
}

export function usageError(cmdName: string, problem: string): Error {
  return new Error(`${problem}\nUsage: ${usageFor(cmdName)}`);
}

// Built from the registry so help can only list commands that actually exist.
export function makeHelpHandler(registry: CommandsRegistry): CommandHandler {
  return async (cmdName: string, ...args: string[]) => {
    if (args.length > 0) {
      printCommandHelp(registry, args[0]);
      return;
    }

    console.log("gator - a command-line RSS feed aggregator");
    console.log("");
    console.log("Usage: npm run start <command> [arguments]");

    const names = Object.keys(registry);
    const width = Math.max(...names.map((name) => usageFor(name).length));

    const groups = new Set(
      names.map((name) => commandHelp[name]?.group ?? "Other"),
    );

    const ordered = [
      ...GROUP_ORDER.filter((group) => groups.has(group)),
      ...[...groups].filter((group) => !GROUP_ORDER.includes(group)),
    ];

    for (const group of ordered) {
      console.log("");
      console.log(group);

      for (const name of names) {
        const help = commandHelp[name];

        if ((help?.group ?? "Other") !== group) {
          continue;
        }

        const usage = usageFor(name);
        const summary = help?.summary ?? "";
        const marker = help?.requiresLogin ? " *" : "";

        console.log(`  ${usage.padEnd(width)}  ${summary}${marker}`);
      }
    }

    console.log("");
    console.log("* requires a logged-in user (see register and login)");
    console.log("Run 'help <command>' for the flags a command accepts.");
  };
}

function printCommandHelp(registry: CommandsRegistry, name: string): void {
  if (!(name in registry)) {
    throw new Error(`Unknown command: ${name}\nRun 'help' to list commands.`);
  }

  const help = commandHelp[name];

  if (!help) {
    console.log(name);
    return;
  }

  console.log(`Usage: ${help.usage}`);
  console.log("");
  console.log(help.summary);

  if (help.requiresLogin) {
    console.log("Requires a logged-in user.");
  }

  if (help.details) {
    console.log("");

    for (const line of help.details) {
      console.log(`  ${line}`);
    }
  }
}
