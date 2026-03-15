# Fantasy Golf App

A web application that allows groups of friends and family to compete in a fantasy golf league across the four men's golf majors each season.

## Features

- **League Management**: Create and manage private leagues with 5-12 members
- **Snake Draft**: Asynchronous draft system with configurable pick deadlines
- **Lineup Management**: Select 4 of 6 drafted golfers for each major tournament
- **Live Scoring**: Real-time score updates during tournaments
- **Season Standings**: Track points and standings across all four majors
- **Notifications**: Email notifications for draft picks, lineup reminders, and results

## Tech Stack

- **Frontend**: Next.js 15 with TypeScript, React Server Components
- **Styling**: Tailwind CSS
- **Database**: Supabase PostgreSQL with Row Level Security
- **Authentication**: Supabase Auth with email/password and Google OAuth
- **Real-time**: Supabase Realtime subscriptions
- **Hosting**: Vercel with cron jobs for score polling

## Architecture

### Database Schema

The application uses a comprehensive database schema with the following key tables:

- `users` - User profiles and authentication
- `leagues` - League management and settings
- `golfers` - Professional golfer database
- `draft_picks` - Draft history and team rosters
- `events` - Tournament events (The Masters, PGA Championship, U.S. Open, The Open Championship)
- `lineups` - User lineups for each event
- `golfer_scores` - Live scoring data
- `event_results` - Calculated team scores and points
- `season_standings` - Season-long point totals

### Key Components

- **Auth System**: Complete authentication with profile management
- **Draft Board**: Real-time draft interface with search and filtering
- **Lineup Manager**: Drag-and-drop lineup selection interface
- **Live Scoreboard**: Real-time tournament scoring display
- **Season Standings**: Comprehensive standings table with event breakdowns

### Scoring System

The scoring system implements the following rules:

1. **Team Composition**: Each team drafts 6 golfers, selects 4 to start each event
2. **Score Calculation**: Sum of best 3 scores from the 4 starters (drop worst score)
3. **Tournament Winner Bonus**: -3 stroke bonus if any starter wins the tournament
4. **Points System**: 15-12-10-8-6-5-4-3-2-1 points for top 10 finishers
5. **Season Champion**: Most points after all 4 majors

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up Supabase project and configure environment variables
4. Run the development server: `npm run dev`

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
```

## Database Setup

1. Import the schema from `schemas/supabase.sql`
2. Enable Row Level Security on all tables
3. Create the necessary policies (included in schema)
4. Set up Supabase Auth with email/password and Google OAuth

## Live Score Integration

The app integrates with the ESPN Golf API to fetch real-time tournament scores. A Vercel cron job polls scores every 5 minutes during tournament days.

## Development

The project follows these conventions:

- TypeScript for type safety
- React Server Components where possible
- Client state management with React hooks
- Supabase for database and auth
- Tailwind CSS for styling
- Component-based architecture

## Future Enhancements

- Mobile app (React Native)
- Chat/messaging within leagues
- Historical season archives
- Playoff/head-to-head bracket format
- Women's majors integration
- Public/open leagues

## License

This project is licensed under the MIT License.