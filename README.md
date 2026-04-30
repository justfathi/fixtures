# Dribl Fixtures

A lightweight, zero-dependency web app for searching Football Victoria fixtures via the [Dribl](https://dribl.com) platform.

🔗 **[Live demo](https://yourusername.github.io/dribl-fixtures)**

![Screenshot](screenshot.png)

## Features

- 🔍 **Live search** — type any team, club, or competition name
- 📅 **Full season fixtures** — all rounds, home/away/bye
- 📍 **Venue links** — tap the venue to open Google Maps
- ⭐ **Next match highlight** — your upcoming game is always called out
- 🔗 **Shareable URLs** — link directly to a team via `?search=Port+Melbourne`
- 📱 **Mobile friendly** — works on any screen size

## How it works

The app calls the public Dribl Match Centre API (`mc-api.dribl.com`) that powers `fv.dribl.com`. No API key or authentication is required — the API has open CORS headers.

```
https://mc-api.dribl.com/api/fixtures
  ?search=<team name>
  &date_range=season
  &season=nPmrj2rmow      ← Football Victoria 2026 season ID
  &tenant=w8zdBWPmBX      ← Football Victoria tenant ID
  &timezone=Australia/Sydney
```

## Deploy to GitHub Pages

1. **Fork or clone** this repo
2. Push to your GitHub account
3. Go to **Settings → Pages** → Source: `main` branch, root folder
4. Your app will be live at `https://yourusername.github.io/dribl-fixtures`

That's it — no build step, no npm, no framework. Pure HTML/CSS/JS.

## Customising for other states

Other Football Australia bodies also use Dribl. To support them, you'd need their `mc_link` and `tenant` ID (discoverable by inspecting network requests on their Dribl instance). Current known instances:

| Body | URL |
|------|-----|
| Football Victoria | fv.dribl.com |
| Football NSW | — |
| Football SA | — |

PRs welcome!

## Season IDs

The app **automatically detects the current season** on load by calling:

```
GET https://mc-api.dribl.com/api/list/seasons?disable_paging=true&tenant=w8zdBWPmBX
```

It picks the entry with `"is_current": true`, so the app works across seasons with no code changes needed. If the API call fails, it falls back to the hardcoded 2026 season ID (`nPmrj2rmow`).

## Local development

No build tools needed. Just open `index.html` in a browser, or serve with any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

## License

MIT — free to use, modify and deploy.
