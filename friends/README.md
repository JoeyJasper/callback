# Callback for you and your friends

Callback is built on [Dossier](https://github.com/AienTech/dossier) by AienTech, changed in October 2026, and is free software under the same licence, the AGPL-3.0.

One server runs a separate Callback for each person. Each one gets:

- their own web address, like `https://priya.jobs.example.com`, with HTTPS;
- their own password;
- their own database, so nobody sees anyone else's profile, resumes or applications.

You add a person with one command. Everything below is typed into the server's terminal.

## What you need

- **A server** running Ubuntu 24.04. Each person's Callback holds about 400 MB of memory once it's been used, and about 300 MB more for a few minutes after it makes a PDF. So:

  | People | Memory | CPUs |
  |--------|--------|------|
  | up to 10 | 8 GB | 4 |
  | 11–25 | 16 GB | 4–8 |
  | 26–40 | 32 GB | 8 |

  Pick a region close to your friends, for example DigitalOcean's Bangalore or AWS Lightsail's Mumbai.
- **Optional: a domain** you own, like `example.com`. Without one, addresses use the free sslip.io service, like `priya.203-0-113-5.sslip.io`, which works but looks less tidy.
- **Optional: an AI key** (for example Anthropic's) and a **JSearch key**, if you want to share them, so your friends don't each need their own. Every person's use is then billed to you.

## 1. Put your copy on GitHub

Your server downloads Callback from your GitHub copy, and the licence asks that the people using your changed version can see its source code there.

1. Sign in at [github.com](https://github.com) (create a free account if you don't have one).
2. Your copy is [github.com/JoeyJasper/callback](https://github.com/JoeyJasper/callback). It's public, as the licence asks, and holds no one's data or passwords.

## 2. Get the server ready

Connect to the server (your provider shows the command, like `ssh root@203.0.113.5`), then install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

If you have a domain, add one DNS record at your domain provider, so every address under it points to the server:

| Type | Name | Value |
|------|------|-------|
| A | `*.jobs` | your server's IP address |

That makes `anything.jobs.example.com` reach your server. It can take up to an hour to work.

## 3. Set it up

```bash
git clone https://github.com/JoeyJasper/callback.git
cd callback/friends
./setup.sh jobs.example.com
```

Leave out `jobs.example.com` if you don't have a domain. It asks for your email (for HTTPS certificate notices) and your time zone, then builds the app, which takes a few minutes the first time.

## 4. Share an AI key and a job source (optional)

```bash
nano shared.env
```

Fill in `DOSSIER_AI_PROVIDER`, `DOSSIER_AI_MODEL` and `DOSSIER_AI_KEY`, and `DOSSIER_JOBS_SOURCE=jsearch` with `DOSSIER_JSEARCH_KEY`. Save with Ctrl+O, Enter, then Ctrl+X, and apply it:

```bash
./update.sh
```

Skip this and each person chooses their own in Settings → AI provider and Settings → Job search. Anyone can also replace the shared ones with their own there.

## 5. Add people

```bash
./add-person.sh joel
./add-person.sh priya
```

Each one prints an address and a password. Send them to that person. The password isn't stored anywhere, so if it's lost, make a new one (below). Names are 2–20 lower-case letters, digits or hyphens.

Everyone then fills in their profile, including the personal details in Profile → Basics that Gulf and Indian CVs show.

## Day to day

| To… | Type |
|-----|------|
| See everyone, and whether their Callback is running | `./list.sh` |
| Give someone a new password (signs them out everywhere) | `./reset-password.sh priya` |
| Take someone offline, keeping their data | `./remove-person.sh priya` |
| Bring them back, as they were | `./restore-person.sh priya` |
| Delete someone and all their data for good | `./remove-person.sh priya --delete-data` |
| Update everyone to the newest version of your copy | `./update.sh` |
| Back up every database now | `./backup.sh` |

To back up every night, type `crontab -e` and add this line, with your folder:

```
30 2 * * * /root/callback/friends/backup.sh >/dev/null 2>&1
```

Backups go to `friends/backups/` and are kept for 14 days. Each Callback also keeps its own nightly backup, which its owner can download in Settings → Your data. Copy `friends/backups/` off the server now and then, in case the server itself is lost.

## Privacy, honestly

Each person's data is in their own database, under their own password and their own encryption secret for saved keys, so people can't see each other's. As the person running the server, though, you *could* read the databases, as any server owner could. Only host people who are fine with that, and tell them.

## If something's wrong

- **An address doesn't open**: check the DNS record (step 2) with `ping priya.jobs.example.com`; it should show your server's IP. The HTTPS certificate is issued on the first visit, which can take a minute.
- **Someone's Callback won't start**: `./list.sh` shows its state; `docker compose -f compose.yml -f people.yml --env-file .env logs app-priya` shows why.
- **The server is slow**: `./list.sh` shows each Callback's memory. If the total is near the server's memory, move to a bigger server.
