# Fantasy Golf App - Supabase Backend Setup Guide

This guide provides complete instructions for setting up the Supabase backend for your fantasy golf application.

## Quick Setup

1. **Copy the SQL Script**: Copy the contents of `supabase_sql_setup.sql` 
2. **Open Supabase SQL Editor**: In your Supabase dashboard, navigate to SQL Editor
3. **Create New Query**: Click "New query" and paste the SQL script
4. **Run the Script**: Execute the script to create all tables, functions, and policies

## Database Schema Overview

### Core Tables

#### Users (`users`)
- Stores user information
- Primary key: `id` (UUID)
- Fields: `display_name`, `email`, `created_at`

#### Leagues (`leagues`) 
- Manages fantasy golf leagues
- Primary key: `id` (UUID)
- Fields: `name`, `commissioner_id`, `status`, `pick_deadline_hours`, `season_year`, `max_members`
- Status values: `draft_pending`, `draft_in_progress`, `draft_complete`, `season_active`, `season_complete`

#### League Members (`league_members`)
- Links users to leagues with draft positions
- Composite primary key: `(league_id, user_id)`
- Fields: `draft_position`

#### Golfers (`golfers`)
- Global table of professional golfers
- Primary key: `id` (UUID) 
- Fields: `name`, `tour`, `world_ranking`, `country`

#### League Golfer Pool (`league_golfer_pool`)
- Controls which golfers are available in each league
- Composite primary key: `(league_id, golfer_id)`
- Fields: `is_active`

#### Draft Picks (`draft_picks`)
- Records all draft selections
- Primary key: `id` (UUID)
- Fields: `league_id`, `user_id`, `golfer_id`, `pick_number`, `picked_at`, `is_auto_pick`

#### Events (`events`)
- Represents the four major tournaments
- Primary key: `id` (UUID)
- Fields: `league_id`, `name`, `year`, `status`, `lineup_lock_time`, `api_tournament_id`
- Status values: `upcoming`, `in_progress`, `complete`

#### Lineups (`lineups`)
- User selections for each event (starters vs bench)
- Primary key: `id` (UUID)
- Fields: `event_id`, `user_id`, `golfer_id`, `is_starter`
- Unique constraint: `(event_id, user_id, golfer_id)`

#### Golfer Scores (`golfer_scores`)
- Real-time scoring data for tournaments
- Primary key: `id` (UUID)
- Fields: `event_id`, `golfer_id`, `round_1-4`, `total_score`, `relative_to_par`, `status`
- Status values: `pending`, `playing`, `made_cut`, `missed_cut`, `wd`, `dq`

#### Event Results (`event_results`)
- Calculated results and points for each user per event
- Primary key: `id` (UUID)
- Fields: `event_id`, `user_id`, `raw_score`, `bonus`, `final_score`, `placement`, `points_awarded`

#### Season Standings (`season_standings`)
- Cumulative season statistics
- Primary key: `id` (UUID)
- Fields: `league_id`, `user_id`, `total_points`, `event_breakdown` (JSONB)

## Key Functions

### `calculate_event_results(p_event_id UUID)`
Automatically calculates final scores, placements, and points for an event when scores are complete.

**Usage:**
```sql
SELECT calculate_event_results('event-uuid-here');
```

### `get_draft_order(p_league_id UUID)`
Returns the draft order for a league.

**Usage:**
```sql
SELECT * FROM get_draft_order('league-uuid-here');
```

### `get_user_lineup(p_event_id UUID, p_user_id UUID)`
Retrieves a user's current lineup for an event with scores.

**Usage:**
```sql
SELECT * FROM get_user_lineup('event-uuid', 'user-uuid');
```

### `get_league_standings(p_league_id UUID)`
Returns current league standings sorted by total points.

**Usage:**
```sql
SELECT * FROM get_league_standings('league-uuid-here');
```

## Views

### `league_info`
Provides current information about all leagues including member counts.

### `event_leaderboard` 
Shows the leaderboard for all events with user details.

### `user_draft_summary`
Summarizes draft picks made by each user in a league.

## Security & Permissions

The schema includes comprehensive Row Level Security (RLS) policies:

- **Users**: Can view all profiles, update only their own
- **Leagues**: Only visible to league members
- **All other tables**: Scoped to league membership
- **Global golfers**: Visible to all authenticated users

## Performance Optimization

- **Indexes**: Created on all foreign keys and frequently queried columns
- **Triggers**: Automatic season standings updates when event results change
- **Functions**: Optimized queries for common operations

## Sample Data

The script includes optional sample golfer data (commented out). Uncomment the INSERT statements to seed with real players:

```sql
-- Uncomment to add sample golfers
INSERT INTO golfers (name, tour, world_ranking, country) VALUES
('Scottie Scheffler', 'PGA Tour', 1, 'USA'),
('Rory McIlroy', 'PGA Tour', 2, 'NIR'),
-- ... more golfers
```

## Scheduled Jobs (Optional)

If using the `pg_cron` extension, you can schedule:

- **Score Updates**: Every 15 minutes during tournament season
- **Data Cleanup**: Daily removal of old draft data

## API Integration Points

### Score Updates
Create a function to update `golfer_scores` from external APIs:

```sql
CREATE OR REPLACE FUNCTION update_golfer_scores_from_api()
RETURNS void AS $$
BEGIN
  -- Your API integration logic here
  -- Update golfer_scores table with real-time data
  -- Call calculate_event_results() when event completes
END;
$$ LANGUAGE plpgsql;
```

### League Management
Use these queries for common operations:

```sql
-- Create a new league
INSERT INTO leagues (name, commissioner_id, season_year, max_members)
VALUES ('My League', 'user-uuid', 2024, 10);

-- Add user to league
INSERT INTO league_members (league_id, user_id, draft_position)
VALUES ('league-uuid', 'user-uuid', 1);

-- Set lineup for event
INSERT INTO lineups (event_id, user_id, golfer_id, is_starter)
VALUES ('event-uuid', 'user-uuid', 'golfer-uuid', true);
```

## Troubleshooting

### Common Issues

1. **Extension Errors**: Ensure `uuid-ossp` and `pg_cron` extensions are enabled
2. **RLS Errors**: Verify policies are correctly applied to all tables
3. **Function Errors**: Check that all required parameters are provided

### Debug Queries

```sql
-- Check table row counts
SELECT 'users' as table_name, COUNT(*) FROM users
UNION ALL
SELECT 'leagues', COUNT(*) FROM leagues
UNION ALL
SELECT 'golfers', COUNT(*) FROM golfers;

-- Check RLS status
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN 
('users', 'leagues', 'golfers', 'events', 'lineups');

-- View active policies
SELECT * FROM pg_policy WHERE polrelid::regclass::text = 'leagues';
```

## Next Steps

1. Set up your Supabase project and run the SQL script
2. Configure your frontend to use the provided API endpoints
3. Implement score fetching from golf APIs
4. Add authentication and user management
5. Create frontend components for league management, drafting, and scoring

## Support

For questions or issues with this schema:
- Check the Supabase documentation for RLS and functions
- Review the sample queries in this guide
- Test functions individually before integrating them into your application