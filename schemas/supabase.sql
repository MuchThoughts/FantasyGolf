-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leagues table
CREATE TABLE leagues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  commissioner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'draft_pending' CHECK (status IN ('draft_pending', 'draft_in_progress', 'draft_complete', 'season_active', 'season_complete')),
  pick_deadline_hours INTEGER DEFAULT 24,
  season_year INTEGER NOT NULL,
  max_members INTEGER CHECK (max_members >= 5 AND max_members <= 12),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- League members table
CREATE TABLE league_members (
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  draft_position INTEGER,
  PRIMARY KEY (league_id, user_id)
);

-- Global golfers table
CREATE TABLE golfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  tour TEXT CHECK (tour IN ('PGA Tour', 'DP World Tour', 'LIV Golf')),
  world_ranking INTEGER,
  country TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- League-specific golfer pool (allows adding/removing golfers per league)
CREATE TABLE league_golfer_pool (
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  golfer_id UUID REFERENCES golfers(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  PRIMARY KEY (league_id, golfer_id)
);

-- Draft picks table
CREATE TABLE draft_picks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  golfer_id UUID REFERENCES golfers(id) ON DELETE CASCADE,
  pick_number INTEGER NOT NULL,
  picked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_auto_pick BOOLEAN DEFAULT false
);

-- Events table (the four majors)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'complete')),
  lineup_lock_time TIMESTAMP WITH TIME ZONE,
  api_tournament_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lineups table
CREATE TABLE lineups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  golfer_id UUID REFERENCES golfers(id) ON DELETE CASCADE,
  is_starter BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (event_id, user_id, golfer_id)
);

-- Golfer scores table
CREATE TABLE golfer_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  golfer_id UUID REFERENCES golfers(id) ON DELETE CASCADE,
  round_1 INTEGER,
  round_2 INTEGER,
  round_3 INTEGER,
  round_4 INTEGER,
  total_score INTEGER,
  relative_to_par INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'playing', 'made_cut', 'missed_cut', 'wd', 'dq')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event results table
CREATE TABLE event_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  raw_score INTEGER,
  bonus INTEGER DEFAULT 0,
  final_score INTEGER,
  placement INTEGER,
  points_awarded INTEGER,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Season standings table
CREATE TABLE season_standings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_points INTEGER DEFAULT 0,
  event_breakdown JSONB DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (league_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE golfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_golfer_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE golfer_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_standings ENABLE ROW LEVEL SECURITY;

-- Policies for users
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Policies for leagues
CREATE POLICY "Leagues visible to members" ON leagues FOR ALL USING (
  id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
);

-- Policies for league_members
CREATE POLICY "Members visible to league members" ON league_members FOR ALL USING (
  league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
);

-- Policies for golfers (global table)
CREATE POLICY "Golfers visible to all authenticated users" ON golfers FOR ALL USING (auth.role() = 'authenticated');

-- Policies for league_golfer_pool
CREATE POLICY "League golfer pool visible to league members" ON league_golfer_pool FOR ALL USING (
  league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
);

-- Policies for draft_picks
CREATE POLICY "Draft picks visible to league members" ON draft_picks FOR ALL USING (
  league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
);

-- Policies for events
CREATE POLICY "Events visible to league members" ON events FOR ALL USING (
  league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
);

-- Policies for lineups
CREATE POLICY "Lineups visible to league members" ON lineups FOR ALL USING (
  event_id IN (SELECT id FROM events WHERE league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid()))
);

-- Policies for golfer_scores
CREATE POLICY "Scores visible to league members" ON golfer_scores FOR ALL USING (
  event_id IN (SELECT id FROM events WHERE league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid()))
);

-- Policies for event_results
CREATE POLICY "Event results visible to league members" ON event_results FOR ALL USING (
  event_id IN (SELECT id FROM events WHERE league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid()))
);

-- Policies for season_standings
CREATE POLICY "Season standings visible to league members" ON season_standings FOR ALL USING (
  league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
);