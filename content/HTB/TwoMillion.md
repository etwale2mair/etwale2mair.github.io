---
title: TwoMillion
description: "HTB TwoMillion: an invite-code API that trusts the client, admin
  by mass assignment, command injection in the VPN generator for a foothold,
  then CVE-2023-0386 for root."
date: 2026-09-27
tags:
  - htb
  - linux
  - web
  - api
  - cve-2023-0386
featured: false
---

> Target : **TwoMillion**, a linux box themed as a clone of the old Hack The Box site, invite code and all.
> The path : talk to the json api the front end uses, get in through the invite flow, promote myself to admin because the api trusts a field it should not, turn an admin action into command execution, then a kernel bug for root.

## Recon

Two ports: ssh and http. The site is `2million.htb`, a rebuild of the classic "join and get your invite" page. Nothing interesting in the html itself, but the whole thing is driven by a json api under `/api/v1`, so that is where the box actually lives.

## The invite flow

Hitting `/api/v1` returns a route list, which is a gift: it tells me every endpoint the app exposes. Under it there is an invite section, and one route stands out: `/api/v1/invite/how/to/generate`. Calling it returns an obfuscated blob of javascript instead of plain text. Deobfuscating it points at `/api/v1/invite/generate` (POST), which hands back an invite code.

With a code i register through `/api/v1/user/register`, log in, and confirm i am authenticated with `/api/v1/user/auth`. So far i am a normal user.

## Becoming admin without being admin

The route list also shows an admin section: a `GET /api/v1/admin/auth` that just checks whether you are admin, and a `PUT /api/v1/admin/settings/update`. That PUT is the mistake. It lets an authenticated user update their own settings, and it reads the fields straight from the json body, including one it should never trust:

```json
{ "email": "bob@bob.bob", "is_admin": 1 }
```

Nothing stops a regular user from sending `is_admin: 1`. The server writes it. `admin/auth` now says i am admin. This is mass assignment: the endpoint binds request fields to the account without an allow-list, so a privileged flag gets set through a request the user fully controls.

## Foothold: command injection in the vpn generator

Being admin unlocks `POST /api/v1/admin/vpn/generate`, which builds a VPN config "for a specific user". It takes a `username` and, under the hood, drops it into a shell command without sanitising it. That is command injection: whatever i put in `username` runs on the server. I pass a reverse shell payload in that field, catch it on my listener, and land as the web user. That is the user flag.

The lesson i take from it: the two bugs chain because each one trusts input from the layer above. The api trusts the client for `is_admin`, and the admin action trusts the admin for a shell argument.

## Loot on disk

From the shell, the app's `.env` holds the database credentials:

```
DB_HOST=127.0.0.1
DB_DATABASE=htb_prod
DB_USERNAME=admin
DB_PASSWORD=SuperDuperPass123
```

That password is reused for a real account on the box, so it moves me off the web user. There is also mail sitting in `/var/mail` worth reading: it mentions an OS upgrade, which is the nudge toward the root path.

## Root: CVE-2023-0386

The mail hint plus the kernel version point at **CVE-2023-0386**, an OverlayFS local privilege escalation. The bug lets an unprivileged user copy a setuid binary through an overlay mount in a way that preserves the setuid bit as root, giving a root-owned setuid shell. I pull a known PoC, build it on the box, run it, and get root.

## Takeaways

- A route list endpoint spells out the whole attack surface. Read it first.
- Mass assignment is the quiet one here: no injection, no payload, just a field the server should have ignored. Always allow-list what a request may set on an account.
- An admin feature that shells out with user input is still command injection. Being admin is not authorisation to run code.
- Credentials in `.env` plus reuse is the classic web-to-system pivot.
- Keep the kernel patched: OverlayFS bugs like CVE-2023-0386 turn any local shell into root.
