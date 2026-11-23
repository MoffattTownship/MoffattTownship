# Moffatt Township website

Single-page site (`public/`) plus a Cloudflare Worker (`worker/index.js`). Content lives in R2 and is edited at `/admin`.

## Local preview
    python3 -m http.server 8099 -d public     # static preview, reads public/data/content.json
    npx wrangler dev                          # full Worker; put DEV_BYPASS_AUTH=true in .dev.vars

## Deploy (GitHub -> Cloudflare)
1. Push to GitHub, then connect the repo in Cloudflare Workers & Pages (Workers Builds). No build command.
2. Create the R2 bucket named `moffatt-township` (or change `wrangler.toml`).
3. Zero Trust > Access > Applications: self-hosted app covering `/admin*`, `/api/upload` and `PUT /api/content` (path `/api/*` with a bypass for GET is not needed: the Worker only checks Access on writes). Allow your admin emails.
4. Copy the team domain and AUD tag into `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.toml`. The Worker fails closed if they are empty.

## Content
`public/data/content.json` is the default. After the first admin save, R2's `content.json` takes over, and each save keeps a copy in `backups/`.
