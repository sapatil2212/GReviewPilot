# Custom domains + HTTPS on a Hostinger VPS (nginx)

How tenant-owned domains get routed and get certificates when this app is
self-hosted behind nginx.

The app issues certificates itself over ACME (Let's Encrypt, HTTP-01), writes one
nginx server block per domain, and reloads nginx. Renewal is handled by a
scheduled job. No certbot involvement.

---

## How a request flows

```
visitor -> clinic.com:443
            nginx  (TLS terminates here, per-domain certificate)
              -> 127.0.0.1:3000  Host: clinic.com preserved
                   Next.js middleware reads Host, rewrites to /s/_d~clinic.com/...
                     -> renders the tenant's site
```

Two things must hold or nothing works:

1. **nginx must pass `Host` through unchanged.** `middleware.ts` identifies which
   tenant site to render from it. Rewriting it serves the dashboard instead of the
   customer's website. The generated config does this; don't "fix" it.
2. **`/.well-known/acme-challenge/` must reach the app over plain HTTP, forever.**
   Renewals revalidate through it every 60 days. A blanket
   `return 301 https://...` on port 80 makes the first certificate work and every
   renewal fail two months later. The generated config carves out that path.

### Two phases, not one

A domain does not go from "DNS verified" straight to HTTPS. It passes through an
HTTP-only phase, and that phase is load-bearing rather than a nicety:

| Phase | vhost | What visitors get |
|---|---|---|
| DNS verified, no certificate yet | port 80 only, proxies everything to the app | the site, over `http://` |
| Certificate issued | ports 80 + 443, 80 redirects (except ACME) | the site, over `https://` |

The reason is a circular dependency. The HTTPS server block names
`ssl_certificate`, so nginx will not load it until a certificate exists — but
obtaining that certificate requires Let's Encrypt to fetch
`http://<domain>/.well-known/acme-challenge/<token>`, which requires a server
block for that hostname. Writing the vhost only *after* issuance succeeded meant
neither side could go first:

```
no vhost  ->  CA's request hits nginx's default server  ->  404
          ->  validation fails  ->  no certificate  ->  no vhost
```

Visitors saw `404 Not Found — nginx` while the dashboard said **Connected**, and
the hourly retry hit the identical wall every hour, forever. Installing the
HTTP-only block first breaks it: validation always lands on the app through the
domain's own server block, and the tenant's site is live within seconds of DNS
resolving instead of 404ing until TLS is sorted out.

`npm run ssl:provision -- --diagnose <domain>` prints this chain one link per
line, so the first `x` is the thing to fix.

---

## One-time server setup

### 1. Directories

The app writes certificates; nginx reads them.

```bash
sudo mkdir -p /var/www/storage/greviewpilot/{acme,certs}
sudo chown -R www-data:www-data /var/www/storage/greviewpilot
sudo chmod 700 /var/www/storage/greviewpilot/acme
sudo chmod 750 /var/www/storage/greviewpilot/certs
```

Replace `www-data` with whatever user the Node process runs as. If the app runs
under a different user than nginx, add nginx's user to a shared group with read
access on `certs` — nginx must be able to read `fullchain.pem` and `privkey.pem`.

### 2. Required `map` in the http block

The generated vhosts use `$connection_upgrade` for WebSocket/SSE upgrades. nginx
has no such variable built in, so **without this map every generated config fails
`nginx -t`**. Add it once inside `http { }` in `/etc/nginx/nginx.conf`:

```nginx
http {
    # ... existing config ...

    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }
}
```

### 2b. Dedicated vhost directory (keep generated configs away from manual ones)

Point `NGINX_VHOST_PATH` at a directory used *only* for generated tenant configs,
separate from `sites-enabled`. Generated files are overwritten and deleted
automatically, so mixing them with hand-maintained vhosts risks losing one.

```bash
sudo mkdir -p /etc/nginx/greviewpilot-sites
sudo chown root:www-data /etc/nginx/greviewpilot-sites
sudo chmod 775 /etc/nginx/greviewpilot-sites
```

Include it inside `http { }` in `/etc/nginx/nginx.conf`:

```nginx
include /etc/nginx/greviewpilot-sites/*;
```

A wildcard that matches nothing is valid in nginx, so this is safe before the
first domain is provisioned. Generated filenames are prefixed
`greviewpilot-<hostname>.conf`, and the app only ever touches files matching that
prefix in this directory.

### 3. Default server block (reject unknown hostnames)

Without this, any domain pointed at your IP gets served *some* tenant's site —
whichever vhost nginx happens to consider first.

`/etc/nginx/sites-available/000-default`:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Both well-known paths must reach the app, not this 404.
    #
    #   acme-challenge          — a domain being provisioned for the first time
    #   greviewpilot-domain-check — the routing probe, which is the ONLY way a
    #                             CNAME or Cloudflare-proxied domain can prove it
    #                             reaches this server (its address will never
    #                             equal SITE_APEX_IP, so the record comparison
    #                             cannot decide it)
    #
    # Forwarding the whole /.well-known/ prefix covers both and anything added
    # later. Narrowing it to acme-challenge alone is what leaves proxied domains
    # unable to verify at all.
    location ^~ /.well-known/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }

    location / {
        return 404;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/000-default /etc/nginx/sites-enabled/
```

Since provisioning now installs an HTTP-only vhost before requesting a
certificate, ACME validation no longer depends on this block — but the routing
probe still does, for any domain that does not resolve straight to
`SITE_APEX_IP`. And the `return 404` half is what stops a stranger's domain
pointed at your IP from being served some arbitrary tenant's site: without a
`default_server`, nginx serves whichever vhost it happens to consider first.

If you have no `default_server` at all, `npm run doctor` says so.

### 4. Privileged reload helper

The app must not have write access to `/etc/nginx` or general `sudo`. Give it
exactly one root-owned script that validates before reloading.

`/usr/local/bin/greviewpilot-nginx-reload`:

```bash
#!/usr/bin/env bash
# Validate, then reload. Never reload a config nginx has not accepted — a bad
# config takes every tenant site down at once.
set -euo pipefail
/usr/sbin/nginx -t
/bin/systemctl reload nginx
```

```bash
sudo chown root:root /usr/local/bin/greviewpilot-nginx-reload
sudo chmod 755 /usr/local/bin/greviewpilot-nginx-reload
```

Sudoers entry — `sudo visudo -f /etc/sudoers.d/greviewpilot`:

```
www-data ALL=(root) NOPASSWD: /usr/local/bin/greviewpilot-nginx-reload
```

Narrow on purpose: one fixed path, no arguments, no wildcards. The app cannot run
anything else as root, and the script takes no input so there is nothing to
inject.

The app also needs write access to the vhost directory:

```bash
sudo chgrp www-data /etc/nginx/sites-enabled
sudo chmod 775 /etc/nginx/sites-enabled
```

### 5. Firewall

If `ufw status` reports `inactive`, nothing is needed — both ports are already
reachable unless the hosting provider blocks them. If it is active:

```bash
sudo ufw allow 80
sudo ufw allow 443
```

**Port 80 must stay open permanently.** It is not only for the first certificate:
every renewal revalidates over plain HTTP. Closing it after setup produces a
working site that silently stops renewing.

### 6. Running under PM2

The reload helper is authorised for a specific user in sudoers, so the app must
run as that user. Check which one:

```bash
pm2 describe greviewpilot | grep -i user
```

If PM2 runs as `root`, the `www-data` sudoers entry is irrelevant (root needs no
authorisation) but every certificate and vhost the app writes will be root-owned,
and nginx workers may not be able to read them. Running as `www-data` is the
configuration these instructions assume:

```bash
sudo -u www-data pm2 start npm --name greviewpilot -- start
```

`npm run doctor` reports the effective writability rather than the user, which is
the thing that actually matters.

---

## App configuration

In `.env` on the VPS:

```bash
APP_URL="https://app.yourdomain.com"

# Where the Node process listens. Must be set explicitly — see the note below.
APP_UPSTREAM="127.0.0.1:3000"

# Your VPS public IP — tenants point root-domain A records at this.
SITE_APEX_IP="203.0.113.10"
# Bare hostname tenants point subdomain CNAMEs at. No scheme, no port.
# Leave blank and it falls back to APP_URL's hostname — correct as long as
# APP_URL's hostname is itself a public, resolvable address (never "localhost"
# in production). Set it explicitly only if the CNAME target should differ from
# the platform host.
SITE_CNAME_TARGET=""
# Issues a certificate + nginx vhost for the www counterpart of APP_URL's
# hostname too, redirecting it to the primary. On by default.
PLATFORM_INCLUDE_WWW="true"

SSL_PROVISIONING="nginx"
ACME_DIRECTORY="staging"          # switch to production after a successful run
ACME_CONTACT_EMAIL="ops@yourdomain.com"
ACME_ACCOUNT_KEY_PATH="/var/www/storage/greviewpilot/acme/account.key"
SSL_CERT_PATH="/var/www/storage/greviewpilot/certs"
NGINX_VHOST_PATH="/etc/nginx/sites-enabled"
NGINX_RELOAD_COMMAND="sudo /usr/local/bin/greviewpilot-nginx-reload"
SSL_CA_ISSUER_DOMAIN="letsencrypt.org"

# Enables the renewal job.
CRON_SECRET="<long random string>"
```

`ACME_DIRECTORY` defaults to `staging` deliberately. Let's Encrypt production
allows about 5 certificates per domain per week; burning that while wiring things
up locks that domain out of HTTPS for days with no appeal. Staging certificates
are real but untrusted — enough to prove the pipeline works.

**Do not leave it on `staging`.** It is a first-run setting, and forgetting it is
its own failure mode: issuance succeeds, logs look clean, and every visitor gets
a full-page browser warning while the dashboard reports `SSL failed`. Two things
make the switch low-risk now — provisioning confirms the validation path is
reachable before submitting an order, so failed attempts no longer eat the weekly
budget, and a staging certificate is recorded as `PENDING` with an explicit
warning rather than `ACTIVE`, so it cannot be mistaken for working HTTPS.

**`APP_UPSTREAM` must be set and must not be 80 or 443.** It is the local address
nginx forwards tenant traffic to. It cannot be derived from `APP_URL`: behind
nginx, `APP_URL` is nginx's own public address, so inferring the upstream from
`https://app.yourdomain.com` yields port 443 and every tenant vhost ends up
proxying plain HTTP into nginx's TLS listener. Env validation rejects those ports
rather than letting the loop reach a config file.

**It must also be the port *this* app listens on, and on a shared box that is
worth checking rather than assuming.** This is the single highest-consequence
value in the file. Every tenant custom domain is proxied to it, so if it names a
port owned by another application, every custom domain serves that application's
website — and nothing in this app's logs says so, because the requests never
arrive. `npm run doctor` proves identity by writing a sentinel to the database and
reading it back through the upstream; it fails rather than warns when the answer
comes from something else.

`CRON_SECRET` must be a real generated value. The cron routes are enabled the
moment it is non-empty, so a placeholder means anyone who guesses it can trigger
the jobs:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Platform host vs. tenant hosts — the one rule that matters

Middleware treats the hostname in `APP_URL` as **the** platform host, and
**every other hostname as a tenant custom domain**. There is no in-between:

- `APP_URL`'s hostname → dashboard, marketing pages, API, everything.
- Any other hostname → routed through the tenant-domain rewrite, and 404s unless
  some tenant's `SiteDomain` claims it.

This app serves the marketing site (`/`, `/about`, `/pricing`) and the dashboard
from the **same Next.js deployment** — they are not separate apps. So if your
marketing site and dashboard should both live at your own domain (the normal
case), `APP_URL` must be set to that domain directly. Pointing `APP_URL` at a
*different* hostname than the one your marketing site is meant to serve — for
example `APP_URL=https://app.yourdomain.com` while visitors land on
`yourdomain.com` — makes `yourdomain.com` a tenant domain in this app's own eyes.
Unless a tenant happens to own it, it 404s. It also means `yourdomain.com` gets no
automatic certificate, because platform certificate provisioning follows
`APP_URL`.

**Fix:** set `APP_URL` to the domain you actually want people to visit.
`PLATFORM_INCLUDE_WWW=true` (default) then covers the `www` counterpart
automatically — both hostnames get certificates and both work.

If you deliberately want the dashboard on a subdomain (`app.yourdomain.com`)
*separate* from a marketing site at the apex, that apex must be served by an
entirely different nginx vhost that never proxies to this app — or registered as
a real tenant `SiteDomain` if this app is meant to render it. `npm run doctor`
checks whether `APP_URL`'s hostname actually resolves and flags the apex/www
distinction with your real values.

---

## Renewal job

The hourly job does four things, and the flow does not complete without it:

1. **Re-verifies DNS** for every domain not yet `CONNECTED`. DNS propagation
   routinely outlasts a tenant's patience — they add the records, press Verify,
   see "not found yet", and leave. Without this the domain would sit in `PENDING`
   forever even after the records went live.
2. **Issues certificates** for domains that just became connected.
3. **Renews** anything within 30 days of expiry.
4. Inspects live certificates, flags problems, and sweeps expired challenge rows.

Certificates last 90 days and are replaced at 30 days remaining. Nothing renews
unless this runs.

```bash
sudo crontab -e
```

```cron
17 * * * * curl -fsS -m 280 -H "Authorization: Bearer <CRON_SECRET>" https://app.yourdomain.com/api/cron/ssl-monitor > /dev/null
```

Hourly, on a minute that isn't zero — every CA sees a flood of requests on the
hour. The job renews what is due, updates status, sweeps expired challenge rows,
and flags anything expiring within 21 days.

---

## Bring-up order

Do this once, in order. Each step fails loudly rather than silently producing a
broken certificate.

```bash
# 0. Preflight. Tests the things that actually break: directory writability by
#    the app user, the sudo reload helper, `nginx -t` over the live config, the
#    include glob, the $connection_upgrade map, database reachability, whether
#    the app is listening on APP_UPSTREAM, and whether APP_URL's hostname
#    actually resolves to this server. Fix every failure before continuing.
npm run doctor

# 1. Confirm configuration is what you think it is.
npm run ssl:provision -- --check

# 2. Confirm the generated nginx config is valid on THIS box.
npm run verify:nginx
npm run verify:nginx:syntax     # runs the real `nginx -t` when nginx is present

# 3. Provision the platform's own certificate FIRST — the dashboard tenants use
#    to add their own domains needs to be reachable over HTTPS before any of
#    this matters. Covers APP_URL's hostname and, by default, its www alias.
npm run ssl:provision -- --platform
#    Expect action=issued for each. Visiting https://yourdomain.com now shows a
#    browser warning — correct for staging. The warning proves TLS terminates
#    with your certificate, not someone else's.

# 4. Switch to production and reissue.
#    Set ACME_DIRECTORY=production, restart the app, then:
npm run ssl:provision -- --platform --force
curl -vI https://yourdomain.com 2>&1 | grep -i "issuer\|subject"

# 5. Now tenant domains. Add one in the dashboard, point DNS, press Verify.
#    Wait for status CONNECTED before going further — issuing against a domain
#    that doesn't resolve to you wastes a rate-limited attempt.
npm run ssl:provision -- --diagnose clinic.com   # read-only, no CA contact
npm run ssl:provision -- --preview clinic.com    # inspect what would be written
npm run ssl:provision -- --host clinic.com       # staging
npm run ssl:provision -- --host clinic.com --force  # after switching to production
```

### Already stuck? (domains connected, sites 404, SSL failed)

If domains were added before this was working, they have no nginx vhost and no
certificate. One command fixes all of them, and it is safe to re-run:

```bash
npm run doctor                       # confirm nginx prerequisites first
npm run ssl:provision -- --all       # installs vhosts + issues certificates
npm run doctor                       # should now report 0 domains without a vhost
```

`--all` walks every CONNECTED domain, installs the HTTP-only vhost, confirms the
validation path answers, then orders the certificate and swaps in the HTTPS
vhost. Domains whose validation path is genuinely broken are skipped with the
reason rather than burning an attempt, so nothing is lost by running it before
every underlying problem is fixed.

After that, tenants connect domains through the dashboard with no manual step:
Verify triggers issuance automatically once DNS resolves. The platform's own
certificate renews automatically too — the hourly job provisions it alongside
every tenant domain, so step 3/4 above only needs to run once.

---

## What the tenant does

**One DNS record.** That is the whole job.

| Their domain | Record | Name / Host | Value |
|---|---|---|---|
| `clinic.com` (root) | A | `@` | your `SITE_APEX_IP` |
| `www.clinic.com` (subdomain) | CNAME | `www` | your `SITE_CNAME_TARGET` |

Root domains need an A record because a CNAME at a zone apex is invalid DNS.
Everything else takes a CNAME.

**Anything that resolves here is accepted, not just the exact record above.**
Verification checks where the name actually ends up, because that is what
matters — several correct setups never name our CNAME target:

| What they have | Why it works |
|---|---|
| `www CNAME theirdomain.com` | chains to their own apex A record, which points here. Hostinger's UI produces this by default |
| `www A <your SITE_APEX_IP>` | some registrars only offer A records |
| apex `ALIAS`/`ANAME` | the provider flattens it to an A record |

Reporting those as "Missing" told the customer to break something that was
already right, so the routing check now falls back to comparing the resolved
address against `SITE_APEX_IP`.

They add it at whichever registrar holds the domain — GoDaddy, Hostinger,
Namecheap, Cloudflare — and that is it. No TXT record, no waiting on the page, no
support ticket. The dashboard rechecks every minute while open, and the hourly job
keeps checking after they close it. When the record resolves, the domain verifies,
a certificate is issued, and nginx is reconfigured without anyone touching
anything.

Adding a root domain also offers the `www` counterpart (checked by default),
created as a separate domain that redirects to the root. Separate rather than both
names on one certificate because the tenant may point one before the other, and an
ACME order naming a hostname that does not yet resolve fails *entirely* rather
than partially. Each gets its own certificate; `www` terminates TLS and redirects
at the edge.

### Why there is no mandatory TXT record

Requiring a TXT verification record on top of the routing record used to be
mandatory here. It bought nothing: **only whoever controls the DNS zone can make a
hostname resolve to your server**, so a matching routing record already proves
control. The second record just meant every tenant did twice the work and some
domains sat unverified with perfectly good routing because the TXT was missing or
mistyped.

The TXT record still exists, marked optional in the UI, for one real case:
verifying ownership *before* moving live traffic. A business whose site is already
serving customers can add the TXT, see the domain verified, and only then switch
the routing record — no window where the domain points at an unprovisioned server.

### Two ways routing is proven

Verification accepts **either**:

1. The routing record resolves to us (`A` = `SITE_APEX_IP`, or the `CNAME` target).
2. `http://<domain>/.well-known/greviewpilot-domain-check` returns that domain's
   verification token.

The second exists because comparing addresses only works when traffic comes
straight to your IP. A tenant behind Cloudflare, a load balancer, or a registrar
that flattens CNAMEs resolves to somebody else's address, so the record check
reports "not pointing here" for a domain that works fine. The HTTP probe is the
stronger signal in general — it confirms traffic actually arrives rather than that
a record looks right.

A domain showing a mismatched `A` record but `CONNECTED` status is therefore
normal and correct, not a bug.

---

## When it doesn't work

Start here, always. It contacts no certificate authority, writes nothing, and
prints the whole chain in the order it has to hold:

```bash
npm run ssl:provision -- --diagnose clinic.com
```

```
  + known domain     status=CONNECTED ssl=FAILED
  + DNS A record     77.37.47.89
  x nginx vhost      /etc/nginx/greviewpilot-sites/greviewpilot-clinic.com.conf  (absent)
  x certificate      none at /var/www/storage/greviewpilot/certs/clinic.com/fullchain.pem
  + CAA              none (any CA may issue)
  x ACME HTTP path   The ACME validation path returned 404. ...
  x live HTTPS       The certificate being served does not cover this domain.
```

Fix the **first** `x`. The bottom two lines are usually symptoms of it.

**The domain shows a different product's website.**
On a box running several apps behind one nginx, this is the most likely fault of
all, and the least obvious: **`APP_UPSTREAM` points at a port owned by another
application.** nginx routes the hostname flawlessly and proxies it straight into
somebody else's product. Every generated vhost is correct, `--nginx` shows ours
serving the hostname, and visitors still get the wrong site.

Ports get reused and reassigned when apps are added, so "something is listening
on that port" proves nothing. Identity is established positively — a sentinel is
written to this app's database and read back through the upstream, which only the
real app can do:

```bash
npm run doctor                                # "APP_UPSTREAM is this application"
npm run ssl:provision -- --nginx clinic.com   # lists every site's upstream
```

`--nginx` prints the upstream of every site on the nginx, so one port serving two
products is visible at a glance. Find the real port and correct `APP_UPSTREAM`:

```bash
pm2 describe greviewpilot | grep -iE "script args|exec cwd|port"
sudo ss -ltnp | grep node        # every listening node process and its PID
```

The same fault also makes ACME validation return 404, because the challenge
request reaches the other app, which knows nothing about the token.

**The domain shows a bare `404 Not Found — nginx`, or another site, and ACME
returns 404.**
The vhost exists, `nginx -t` passes, the reload succeeds — and nginx never
consults it. Three causes, none visible to a grep over `/etc/nginx`:

```bash
npm run ssl:provision -- --nginx clinic.com   # reads nginx -T, run as root
```

1. **The vhost directory is not in nginx's effective config.** The `include` line
   is missing, or was pasted into a `sites-available` file that is not symlinked
   into `sites-enabled` — where it matches every grep and is loaded by nothing.
   Every generated vhost is then inert, so the hostname falls to whichever other
   site nginx matches. Fix, inside `http { }` in `/etc/nginx/nginx.conf`:
   `include /etc/nginx/greviewpilot-sites/*;`
2. **Another server block already claims the hostname.** nginx keeps the first it
   loads and ignores the rest, warning on reload rather than failing — so
   `nginx -t` still passes. Remove the hostname from the other block.
3. **The other site binds a specific address**, e.g. `listen 203.0.113.10:80`.
   nginx chooses the listening socket *before* it looks at `server_name`, so a
   generated vhost saying `listen 80` is in a different socket group and is never
   consulted for requests arriving on that address.

On 443 there is a fourth, benign case: before a certificate exists, a domain has
no TLS listener at all by design, so nginx answers with whatever `443
default_server` it has and presents that site's certificate. `--diagnose` reports
it as `served certificate covers: <other site>`. It resolves itself the moment
issuance succeeds; it is not the cause of anything.

**The domain shows `404 Not Found — nginx` but the dashboard says Connected.**
The single most common failure, and the one that looks least like its cause.
There is no nginx server block for that hostname, so nginx answers from its
default server. `--diagnose` reports `nginx vhost  (absent)`. Fix:

```bash
npm run ssl:provision -- --host clinic.com
```

That now installs the HTTP-only vhost first, so the site is live over HTTP even
if the certificate step then fails — and the certificate step can finally
succeed, because validation has somewhere to land. `npm run doctor` audits every
CONNECTED domain for a missing vhost and fails if it finds one.

If provisioning reports `nginx could not be configured for this domain`, the
cause is in the message: usually `NGINX_VHOST_PATH` not writable by the app user,
or the sudo reload helper prompting for a password.

**"SSL pending" forever, `--host` reports validation failure.**
The CA could not fetch the challenge. Check it from outside the box:

```bash
curl -i http://clinic.com/.well-known/acme-challenge/test
```

Expect 404 from the app, *not* a redirect and not tenant site HTML. A 301/308
means something is redirecting port 80 to HTTPS — the usual culprit is a
hand-written vhost or a Cloudflare "Always Use HTTPS" rule. Provisioning runs
this same request itself before ordering, and refuses to spend a rate-limited
attempt when the answer is definitely wrong, so the reason now appears on the
domain rather than as a generic authorization failure.

**Certificate issued, browser still warns.**
`ACME_DIRECTORY` is still `staging`. Staging certificates are real and issue
successfully — the pipeline looks like it worked — but no browser trusts them, so
the dashboard reports `SSL failed` with "not trusted by browsers" and visitors get
a full-page warning. Set production and re-run with `--force`:

```bash
npm run ssl:provision -- --host clinic.com --force
```

`--diagnose` names it explicitly when the certificate on disk was issued by the
staging CA.

**`nginx -t` fails: unknown variable "connection_upgrade".**
The `map` from step 2 is missing.

**Reload fails with a sudo password prompt.**
The sudoers entry doesn't match. `sudo -u www-data sudo -n /usr/local/bin/greviewpilot-nginx-reload`
should run without prompting.

**"CAA records block certificate issuance."**
The tenant's DNS has a CAA record that doesn't authorise Let's Encrypt. They must
add `0 issue "letsencrypt.org"` or remove the existing CAA records. The dashboard
names the exact zone and current values.

**Rate limited.**
Too many certificates for one domain in a week. It clears on its own; there is no
override. This is what staging exists to prevent.

---

## Behind Cloudflare

If a tenant proxies their domain through Cloudflare (orange cloud), Cloudflare
terminates TLS and your certificate is never seen by visitors. HTTP-01 also fails
unless they allow `/.well-known/acme-challenge/` through. Either ask them to set
DNS-only (grey cloud), or accept Cloudflare's certificate and set
`SSL_CA_ISSUER_DOMAIN` accordingly so CAA warnings stay accurate. Verification
detects the proxy: the A record won't match `SITE_APEX_IP`.

---

## What is verified automatically

| Command | Covers |
|---|---|
| `npm run doctor` | directory writability, sudo reload helper, live `nginx -t`, include glob, `$connection_upgrade` map, default-server `/.well-known/` carve-out, **every CONNECTED domain is served by its own vhost**, **`APP_UPSTREAM` really is this app**, DB, unused env vars |
| `npm run ssl:provision -- --diagnose <host>` | one domain end to end: DB row, DNS, vhost, certificate on disk, CAA, live ACME path, served certificate, plus the nginx report below. Read-only, contacts no CA |
| `npm run ssl:provision -- --nginx <host>` | reads `nginx -T` and names the server block that actually serves the hostname on 80 and 443, whether our vhost directory is loaded at all, hostname collisions, and listen-address hazards |
| `npm run verify:nginx` | vhost generation (HTTPS, alias, and HTTP-only bootstrap), config-injection rejection, ACME path preserved on port 80, upstream not pointing at nginx |
| `npm run verify:nginx:syntax` | brace/terminator structure, and real `nginx -t` when available |
| `npm run verify:tls` | certificate inspection against valid/expired/mismatched/self-signed hosts, CAA logic |
| `npm run smoke:domain` | custom-domain routing, canonical redirects, SSL reconciliation, cron auth |

---

## Storage paths that are set but unused

If your `.env` carries `AVATARS_PATH`, `BUSINESS_LOGOS_PATH`, `REVIEW_IMAGES_PATH`,
`QR_CODES_PATH`, `EXPORTS_PATH`, `IMPORTS_PATH`, `REPORTS_PATH`, `TEMP_PATH` or
`AI_CACHE_PATH`, **nothing reads them.** They are harmless but misleading.

Media goes through one root, `STORAGE_LOCAL_PATH`, with the storage layer
namespacing every object automatically:

```
<STORAGE_LOCAL_PATH>/tenants/<tenantId>/<category>/<yyyymm>/<sha256>-<nonce>.<ext>
```

Website-builder uploads are the one exception, routed to `WEBSITE_MEDIA_PATH` so a
tenant's site assets can be backed up independently of their media library.
Exports, reports and AI results are generated in memory or stored in the database
and never touch disk.

`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` are also unused —
`DATABASE_URL` carries all of them, and having both invites them to drift apart.
`npm run doctor` lists whichever of these it finds.

If you would rather each category had its own directory, that is a change to the
storage layer, not just configuration — say so and it can be wired up.
