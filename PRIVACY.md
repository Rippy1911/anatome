# Privacy

_Last updated: 2026-08-07_

This describes **anatome.dev and api.anatome.dev**, the free open-source tier. The hosted product
at platform.anatome.dev is a separate service with its own policy.

The short version: without an account we store a hashed counter and nothing else. With an
account we store the food and workout entries you log, and you can take them or delete them at
any moment without asking us.

## Using Anatome without an account

Most of Anatome — muscle diagrams, exercise search, session heatmaps, the catalog — needs no
account, and we do not create one for you.

What is stored for anonymous callers:

| What | Why | How long |
| --- | --- | --- |
| A SHA-256 hash of your IP address or MCP session id, plus a count for today | Enforcing the 50-requests-per-day fair-use limit | ~36 hours, then it expires automatically |

That is the whole list. No cookies, no analytics profile, no advertising identifiers, no
fingerprinting, no third-party scripts on the site or the API. The raw IP address is not written
anywhere by us; only the hash is, and only so that today's count can be found again.

Cloudflare, as the network in front of the service, processes requests on our behalf under their
own terms — the same as for any site on their network.

## Using Anatome with an account

An account exists only if you create one, which happens when you connect an assistant and choose
to sign in. It lets you log meals, water, workouts and body weight.

What is stored:

| What | Notes |
| --- | --- |
| Your email address | The only identifier. Used to sign in. We do not email you — see below. |
| A salted PBKDF2-SHA256 hash of your password | The password itself is never stored and cannot be recovered. See the note below on the iteration count. |
| Your timezone | So days roll over at your local midnight rather than UTC. |
| Meals, water, workouts, sets, body measurements, goals | Exactly what you (or your assistant on your behalf) logged. |
| Hashes of your access, refresh and session tokens | So a token can be checked and revoked. The tokens themselves are not stored. |
| A registered OAuth client record per assistant you connect | Name and callback URL. |

What is **not** stored: your name, your location, your device, your IP address against your
account, anything you said to your assistant, or any data from a third party. Anatome never sees
your conversation — your assistant decides what to send and sends only the structured entry.

### Your data is yours

- **Export** — `GET /account/export.json` or `.csv` while signed in, or ask your assistant to run
  `export_my_data`. Everything, immediately, no request form and no waiting period.
- **Delete** — the account page, or `delete_my_account`. This is a hard delete: the account and
  every meal, workout, measurement, goal and token are removed immediately. There is no soft
  delete, no grace period and no backup we would restore you from.
- **Correct** — delete the entry and log it again, or change your timezone and goals at any time.

### We do not

- sell, rent or share your data with anyone;
- use it to train any model;
- run analytics, advertising or tracking against it;
- read it, except where you have asked for support and explicitly shared something.

## Where it is stored

Cloudflare Workers, KV and D1, in Cloudflare's network. The database region follows the
Cloudflare account the deployment belongs to; for anatome.dev that is the EU.

**If you self-host,** none of your users' data comes to us at all — it lives in your own
Cloudflare account, and this document then describes your service, not ours. You are the
controller and should publish your own version.

### One thing to know about how passwords are hashed

Passwords are hashed with PBKDF2-HMAC-SHA256, a unique salt per account, at **100 000
iterations**. That is the maximum Cloudflare Workers allows — the runtime rejects anything
higher. OWASP's guidance for this algorithm is 600 000, so it is weaker than we would pick if
the platform let us.

What that means practically: an attacker who obtained the database would find brute-forcing a
short or common password roughly six times cheaper than the current recommendation. **Use a
password manager and a long random password.** The stored iteration count is per account, so if
the cap is raised we can strengthen new and changed passwords without locking anyone out.

We would rather write this down than let you assume it is stronger than it is.

## No email, and what that costs you

Anatome sends no email. There is no verification message, no newsletter and no marketing — and
also **no password reset**. If you lose your password you cannot recover the account. Use a
password manager. This is a deliberate trade: adding email would mean adding an email provider
that a self-hoster would then be forced to configure, and we would rather be honest about the
gap than make the project harder to run. It is a documented limitation, not an oversight.

## Children

Anatome is not directed at children under 16 and we do not knowingly hold their data. If you
believe a child has created an account, contact us and we will delete it.

## Changes

Material changes will be noted here with a new "Last updated" date and in the repository
CHANGELOG. The commit history of this file is the full record.

## Contact

contact@nextsolutions.studio — for access, deletion, or anything you think this document gets
wrong. You do not need to write to us to export or delete your data; both are buttons.
