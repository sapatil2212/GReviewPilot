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

### 3. Default server block (reject unknown hostnames)

Without this, any domain pointed at your IP gets served *some* tenant's site —
whichever vhost nginx happens to consider first.

`/etc/nginx/sites-available/000-default`:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Newly-pointed domains validate here before their own vhost exists.
    location ^~ /.well-known/acme-challenge/ {
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

That ACME carve-out matters: a domain's first certificate is requested before its
vhost is installed, so validation lands on the default server.

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

```bash
sudo ufw allow 80
sudo ufw allow 443
```

Port 80 must stay open permanently. Closing it after setup breaks renewals.

---

## App configuration

In `.env` on the VPS:

```bash
APP_URL="https://app.yourdomain.com"

# Your VPS public IP — tenants point A records at this.
SITE_APEX_IP="203.0.113.10"

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

---

## Renewal job

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
# 1. Confirm configuration is what you think it is.
npm run ssl:provision -- --check

# 2. Confirm the generated nginx config is valid on THIS box.
npm run verify:nginx
npm run verify:nginx:syntax     # runs the real `nginx -t` when nginx is present

# 3. Add the domain in the dashboard, point DNS, press Verify.
#    Wait for status CONNECTED before going further — issuing against a domain
#    that doesn't resolve to you wastes a rate-limited attempt.

# 4. Inspect what would be written.
npm run ssl:provision -- --preview clinic.com

# 5. Issue a staging certificate.
npm run ssl:provision -- --host clinic.com
#    Expect action=issued. Visiting https://clinic.com now shows a browser
#    warning — correct for staging. The warning proves TLS terminates with your
#    certificate.

# 6. Switch to production and reissue.
#    Set ACME_DIRECTORY=production, restart the app, then:
npm run ssl:provision -- --host clinic.com --force

# 7. Confirm.
curl -vI https://clinic.com 2>&1 | grep -i "issuer\|subject"
```

After that, tenants connect domains through the dashboard with no manual step:
Verify triggers issuance automatically once DNS resolves.

---

## Tenant-facing DNS

The dashboard shows these. Apex and subdomain differ because CNAME at a zone apex
is invalid DNS.

| Domain type | Record | Name | Value |
|---|---|---|---|
| `clinic.com` | A | `@` | your `SITE_APEX_IP` |
| `www.clinic.com` | CNAME | `www` | your app hostname |
| both | TXT | `_greviewpilot` | verification token from the dashboard |

---

## When it doesn't work

**"SSL pending" forever, `--host` reports validation failure.**
The CA could not fetch the challenge. Check it from outside the box:

```bash
curl -i http://clinic.com/.well-known/acme-challenge/test
```

Expect 404 from the app, *not* a redirect and not tenant site HTML. A 301/308
means something is redirecting port 80 to HTTPS — the usual culprit is a
hand-written vhost or a Cloudflare "Always Use HTTPS" rule.

**Certificate issued, browser still warns.**
`ACME_DIRECTORY` is still `staging`. Set production and re-run with `--force`.

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
| `npm run verify:nginx` | vhost generation, config-injection rejection, ACME path preserved on port 80 |
| `npm run verify:nginx:syntax` | brace/terminator structure, and real `nginx -t` when available |
| `npm run verify:tls` | certificate inspection against valid/expired/mismatched/self-signed hosts, CAA logic |
| `npm run smoke:domain` | custom-domain routing, canonical redirects, SSL reconciliation, cron auth |
