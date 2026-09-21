import { readConfig } from "./config.js";
import {
  getUserByName,
  type User,
} from "./lib/db/queries/users.js";

import type { CommandHandler } from "./commands.js";

export type UserCommandHandler = (
  cmdName: string,
  user: User,
  ...args: string[]
) => Promise<void>;

export function middlewareLoggedIn(
  handler: UserCommandHandler,
): CommandHandler {
  return async (cmdName: string, ...args: string[]) => {
    const config = readConfig();

    if (config.currentUserName === "") {
      throw new Error(
        `${cmdName} needs a logged-in user. Run 'register <name>' or 'login <name>' first.`,
      );
    }

    const user = await getUserByName(
      config.currentUserName,
    );

    if (!user) {
      throw new Error(
        `User ${config.currentUserName} not found. Run 'login <name>' with an existing user, or 'users' to list them.`,
      );
    }

    await handler(cmdName, user, ...args);
  };
}
