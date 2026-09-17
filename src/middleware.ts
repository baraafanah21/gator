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

    const user = await getUserByName(
      config.currentUserName,
    );

    if (!user) {
      throw new Error(
        `User ${config.currentUserName} not found`,
      );
    }

    await handler(cmdName, user, ...args);
  };
}
