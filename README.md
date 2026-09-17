# gator

gator is a command-line RSS feed aggregator. You add RSS feeds, follow the ones you care about, and let gator collect their posts into a PostgreSQL database in the background. Then you browse the latest posts from your terminal.

It supports multiple users on one machine. Each user follows their own set of feeds.

## Requirements

- **Node.js 22**: the exact version is pinned in `.nvmrc`. If you use [nvm](https://github.com/nvm-sh/nvm), run `nvm use` in the repo.
- **PostgreSQL 16 or newer**: a running server and a database for gator to use.

## Installation

Clone the repo and install dependencies:

```bash
git clone https://github.com/baraafanah21/gator.git
cd gator
npm install
```

## Setup

### 1. Create the database

Create an empty database, for example with `psql`:

```bash
psql -U postgres -c "CREATE DATABASE gator;"
```

### 2. Create the config file

gator reads its settings from `~/.gatorconfig.json` in your home directory. Create it with your database connection string:

```json
{
  "db_url": "postgres://postgres:postgres@localhost:5432/gator?sslmode=disable",
  "current_user_name": ""
}
```

- `db_url`: the PostgreSQL connection string. Replace the username, password, host, port and database name with your own.
- `current_user_name`: the user who is currently logged in. Leave it as an empty string. gator fills it in when you run `register` or `login`.

Both fields are required. gator will not start if either is missing.

### 3. Run the migrations

This creates the tables gator needs:

```bash
npx drizzle-kit migrate
```

The migration tool reads the database URL from the same config file, so create the config file first.

## Usage

Run gator commands through npm:

```bash
npm run start <command> [arguments]
```

### Quick start

```bash
# Create a user and log in as them
npm run start register alice

# Add a feed. You automatically follow feeds you add.
npm run start addfeed "Hacker News" "https://hnrss.org/newest"

# Collect posts every minute (leave it running; stop with Ctrl+C)
npm run start agg 1m

# In another terminal: show the 10 newest posts
npm run start browse 10
```

### Commands

#### Users

| Command | Description |
| --- | --- |
| `register <name>` | Create a user and log in as them. |
| `login <name>` | Switch to an existing user. |
| `users` | List all users. The current user is marked `(current)`. |

#### Feeds

| Command | Description |
| --- | --- |
| `addfeed <name> <url>` | Add an RSS feed and follow it. Requires login. |
| `feeds` | List every feed with its URL and the user who added it. |
| `follow <url>` | Follow a feed that someone has already added. Requires login. |
| `following` | List the feeds you follow. Requires login. |
| `unfollow <url>` | Stop following a feed. Requires login. |

#### Posts

| Command | Description |
| --- | --- |
| `agg <interval>` | Keep fetching feeds, one per interval, and save new posts. |
| `browse [limit]` | Show the newest posts from feeds you follow. Shows 2 if you don't give a limit. Requires login. |

#### Maintenance

| Command | Description |
| --- | --- |
| `reset` | Delete all users. Their feeds, follows and posts are deleted too. |

### How `agg` works

`agg` runs until you press Ctrl+C. Each interval, it picks the feed that has gone longest without being fetched (feeds that have never been fetched come first). It then fetches that feed and saves any posts it hasn't seen before.

The interval is a number followed by a unit: `ms`, `s`, `m` or `h`. For example `30s`, `5m` or `1h`. Use an interval of a minute or more so you don't overload the sites you're fetching from.

gator only reads RSS feeds. Atom feeds (ones whose XML starts with `<feed>`) are not supported yet.

## Development

The database schema is defined in `src/lib/db/schema.ts`. After changing it, generate a new migration and apply it:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```
