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

# Keep one for later, then hide the rest from your unread list
npm run start bookmark "https://example.com/a-post"
npm run start markread -- --all
```

Run `npm run start help` at any point to see every command.

### Passing flags

`npm run` keeps flags for itself, so put `--` before any flag you mean for gator:

```bash
npm run start browse -- --limit 10 --unread
```

Arguments that are not flags need no `--`, so `npm run start browse 10` works as is.

### Commands

Run `npm run start help` for this list in your terminal, or `help <command>` for
one command's flags.

#### Users

| Command | Description |
| --- | --- |
| `register <name>` | Create a user and log in as them. |
| `login <name>` | Switch to an existing user. |
| `users` | List all users. The current user is marked `(current)`. |

#### Feeds

| Command | Description |
| --- | --- |
| `addfeed <name> <url>` | Add an RSS or Atom feed and follow it. Requires login. |
| `feeds` | List every feed with its URL, owner, follower and post counts, and when it was last fetched. |
| `follow <url>` | Follow a feed that someone has already added. Requires login. |
| `following [--unread]` | List the feeds you follow, with how many posts you haven't read, how many posts each has, and when it was last fetched. `--unread` hides feeds with nothing new. Requires login. |
| `unfollow <url>` | Stop following a feed. Requires login. |
| `deletefeed <url>` | Delete a feed you added, along with its posts. Only the user who added the feed can delete it. Requires login. |
| `import <file>` | Add and follow every feed in an OPML file. Requires login. |
| `export [file]` | Write the feeds you follow as OPML. Requires login. |

#### Posts

| Command | Description |
| --- | --- |
| `agg <interval> [--limit <n>]` | Keep fetching feeds, one per interval, and save new posts. |
| `fetch [url]` | Fetch every feed you follow once, right now, or just the feed at `url`. Requires login. |
| `browse [limit] [flags]` | Show the newest posts from feeds you follow. Shows 2 if you don't give a limit. Requires login. |
| `bookmarks [limit] [flags]` | Show your bookmarked posts. Takes the same flags as `browse`. Requires login. |
| `bookmark <url>` | Bookmark a post by its URL. Requires login. |
| `unbookmark <url>` | Remove a bookmark. Requires login. |
| `markread <url>` | Mark a post read. With `--all`, marks every post from feeds you follow. Requires login. |
| `markunread <url>` | Mark a post unread again. Requires login. |

#### Maintenance

| Command | Description |
| --- | --- |
| `help [command]` | List every command, or show one command's flags. |
| `reset` | Delete all users. Their feeds, follows and posts are deleted too. |

### Filtering what you browse

`browse` and `bookmarks` accept these flags:

| Flag | Description |
| --- | --- |
| `--limit <n>` | How many posts to show. The same as the positional limit. |
| `--offset <n>` | Skip the first `n` posts, for paging through results. |
| `--feed <name>` | Only posts from feeds whose name contains `<name>`. |
| `--search <term>` | Only posts whose title or description contains `<term>`. |
| `--since <age>` | Only posts newer than an age such as `2d` or `12h`. |
| `--unread` | Only posts you have not marked read. |
| `--bookmarked` | Only posts you have bookmarked. |
| `--full` | Show the whole description instead of a short preview. |
| `--mark-read` | Mark every post shown as read. |

Matching ignores case. Descriptions have their HTML stripped so they read in a
terminal; `--full` shows the whole thing.

```bash
# The 5 newest unread posts from feeds with "rust" in the name, mentioning cargo
npm run start browse -- --limit 5 --unread --feed rust --search cargo

# Page through everything from the past week, 10 at a time
npm run start browse -- --limit 10 --since 7d
npm run start browse -- --limit 10 --since 7d --offset 10

# Read something later
npm run start bookmark https://example.com/a-post
npm run start bookmarks
```

Read state and bookmarks are per user: marking a post read does not change it
for anyone else.

### Moving feeds in and out

OPML is the file format feed readers use to hand reading lists to each other, so
it is how you get a list of feeds into gator without adding them one at a time:

```bash
# See what an OPML file would do before it touches the database
npm run start import feeds.opml -- --dry-run

# Add and follow everything in it
npm run start import feeds.opml

# Write the feeds you follow back out
npm run start export my-feeds.opml
```

`import` walks the folders other readers nest their feeds in, ignores duplicate
URLs, and follows feeds gator already knows instead of adding them twice.
Running it twice changes nothing the second time, so it is safe to re-run.

`export` writes to stdout when you give it no file, which makes it pipeable.
Add `--all` to export every feed in the database rather than only yours:

```bash
npm run start export -- --all > everything.opml
```

### How `agg` works

`agg` runs until you press Ctrl+C. Each interval, it picks the feed that has gone longest without being fetched (feeds that have never been fetched come first). It then fetches that feed and saves any posts it hasn't seen before.

The interval is a number followed by a unit: `ms`, `s`, `m`, `h` or `d`. For example `30s`, `5m` or `1h`. Use an interval of a minute or more so you don't overload the sites you're fetching from.

Pass `--limit <n>` to stop after `n` rounds instead of running until Ctrl+C, which is handy for a one-off fetch:

```bash
npm run start agg 1m -- --limit 1
```

### Fetching right away

`agg` fetches one feed per interval, so after an `import` it can take a while to
reach every feed. `fetch` fetches all the feeds you follow once, back to back,
and then exits:

```bash
# Everything you follow
npm run start fetch

# Just one feed
npm run start fetch https://hnrss.org/newest
```

If a feed fails to download or parse, `fetch` reports it and moves on to the
next one. It exits with an error at the end naming the feeds that failed, so
scripts can tell something went wrong.

gator reads both RSS (`<rss><channel>`) and Atom (`<feed>`) feeds. Atom entries are mapped onto the same fields: the `alternate` link becomes the post URL, `summary` or `content` becomes the description, and `published` or `updated` becomes the publish date.

## Development

The database schema is defined in `src/lib/db/schema.ts`. After changing it, generate a new migration and apply it:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```
