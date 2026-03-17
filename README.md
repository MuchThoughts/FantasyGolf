# Fantasy Golf Majors

A web app that shows five fantasy golf team tables with scores relative to par across the four majors from last year.

## Data source

- ESPN PGA scoreboard API: `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard`

## Behavior

- Pulls last year's Masters, PGA Championship, U.S. Open, and The Open.
- Renders five team tables: Sean, Lia, Adair, Rhett, VP.
- Shows each player's score per major plus player overall.
- Shows each team total per major plus team overall.
- `*` indicates one or more missing player scores in that total.

## Run locally

```bash
npm run dev
```

Then open `http://127.0.0.1:3000`.
