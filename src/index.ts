
import {
  handlerAddFeed,
  handlerAgg,
  handlerBookmark,
  handlerBookmarks,
  handlerBrowse,
  handlerDeleteFeed,
  handlerExport,
  handlerFeeds,
  handlerFollow,
  handlerFollowing,
  handlerImport,
  handlerLogin,
  handlerMarkRead,
  handlerMarkUnread,
  handlerRegister,
  handlerReset,
  handlerUnbookmark,
  handlerUnfollow,
  handlerUsers,
  registerCommand,
  runCommand,
  type CommandsRegistry,
} from "./commands.js";
import { makeHelpHandler } from "./help.js";
import { middlewareLoggedIn } from "./middleware.js";

async function main(): Promise<void> {
  const registry: CommandsRegistry = {};

  registerCommand(registry, "register", handlerRegister);
  registerCommand(registry, "login", handlerLogin);
  registerCommand(registry, "users", handlerUsers);

  registerCommand(registry, "addfeed", middlewareLoggedIn(handlerAddFeed));
  registerCommand(registry, "feeds", handlerFeeds);
  registerCommand(registry, "follow", middlewareLoggedIn(handlerFollow));
  registerCommand(registry, "following", middlewareLoggedIn(handlerFollowing));
  registerCommand(registry, "unfollow", middlewareLoggedIn(handlerUnfollow));
  registerCommand(registry, "deletefeed", middlewareLoggedIn(handlerDeleteFeed));
  registerCommand(registry, "import", middlewareLoggedIn(handlerImport));
  registerCommand(registry, "export", middlewareLoggedIn(handlerExport));

  registerCommand(registry, "agg", handlerAgg);
  registerCommand(registry, "browse", middlewareLoggedIn(handlerBrowse));
  registerCommand(registry, "bookmarks", middlewareLoggedIn(handlerBookmarks));
  registerCommand(registry, "bookmark", middlewareLoggedIn(handlerBookmark));
  registerCommand(registry, "unbookmark", middlewareLoggedIn(handlerUnbookmark));
  registerCommand(registry, "markread", middlewareLoggedIn(handlerMarkRead));
  registerCommand(registry, "markunread", middlewareLoggedIn(handlerMarkUnread));

  registerCommand(registry, "reset", handlerReset);
  registerCommand(registry, "help", makeHelpHandler(registry));

  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Error: not enough arguments");
    console.error("Run 'help' to list commands.");
    process.exit(1);
  }

  const cmdName = args[0];
  const cmdArgs = args.slice(1);

  try {
    await runCommand(registry, cmdName, ...cmdArgs);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  process.exit(0);
}

main();
