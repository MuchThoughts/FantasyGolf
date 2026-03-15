-- Fantasy Golf App - Complete Supabase SQL Setup
-- This script contains all the necessary SQL for the fantasy golf backend

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ========================================
-- TABLES
-- ========================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leagues table
CREATE TABLE IF NOT EXISTS leagues (
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
CREATE TABLE IF NOT EXISTS league_members (
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  draft_position INTEGER,
  PRIMARY KEY (league_id, user_id)
);

-- Global golfers table
CREATE TABLE IF NOT EXISTS golfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  tour TEXT CHECK (tour IN ('PGA Tour', 'DP World Tour', 'LIV Golf')),
  world_ranking INTEGER,
  country TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- League-specific golfer pool
CREATE TABLE IF NOT EXISTS league_golfer_pool (
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  golfer_id UUID REFERENCES golfers(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  PRIMARY KEY (league_id, golfer_id)
);

-- Draft picks table
CREATE TABLE IF NOT EXISTS draft_picks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  golfer_id UUID REFERENCES golfers(id) ON DELETE CASCADE,
  pick_number INTEGER NOT NULL,
  picked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_auto_pick BOOLEAN DEFAULT false
);

-- Events table (the four majors)
CREATE TABLE IF NOT EXISTS events (
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
CREATE TABLE IF NOT EXISTS lineups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  golfer_id UUID REFERENCES golfers(id) ON DELETE CASCADE,
  is_starter BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (event_id, user_id, golfer_id)
);

-- Golfer scores table
CREATE TABLE IF NOT EXISTS golfer_scores (
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
CREATE TABLE IF NOT EXISTS event_results (
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
CREATE TABLE IF NOT EXISTS season_standings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_points INTEGER DEFAULT 0,
  event_breakdown JSONB DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (league_id, user_id)
);

-- ========================================
-- ROW LEVEL SECURITY
-- ========================================

-- Enable RLS on all tables
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

-- ========================================
-- INDEXES
-- ========================================

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_leagues_commissioner ON leagues(commissioner_id);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);
CREATE INDEX IF NOT EXISTS idx_league_members_league ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_league_members_user ON league_members(user_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_league ON draft_picks(league_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_user ON draft_picks(user_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_golfer ON draft_picks(golfer_id);
CREATE INDEX IF NOT EXISTS idx_events_league ON events(league_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_lineups_event ON lineups(event_id);
CREATE INDEX IF NOT EXISTS idx_lineups_user ON lineups(user_id);
CREATE INDEX IF NOT EXISTS idx_lineups_golfer ON lineups(golfer_id);
CREATE INDEX IF NOT EXISTS idx_golfer_scores_event ON golfer_scores(event_id);
CREATE INDEX IF NOT EXISTS idx_golfer_scores_golfer ON golfer_scores(golfer_id);
CREATE INDEX IF NOT EXISTS idx_event_results_event ON event_results(event_id);
CREATE INDEX IF NOT EXISTS idx_event_results_user ON event_results(user_id);
CREATE INDEX IF NOT EXISTS idx_season_standings_league ON season_standings(league_id);
CREATE INDEX IF NOT EXISTS idx_season_standings_user ON season_standings(user_id);

-- ========================================
-- FUNCTIONS AND TRIGGERS
-- ========================================

-- Function to update season standings when event results are calculated
CREATE OR REPLACE FUNCTION update_season_standings()
RETURNS TRIGGER AS $$
BEGIN
  -- Update or insert season standings
  INSERT INTO season_standings (league_id, user_id, total_points, event_breakdown)
  VALUES (
    (SELECT league_id FROM events WHERE id = NEW.event_id),
    NEW.user_id,
    NEW.points_awarded,
    jsonb_build_object(
      (SELECT name FROM events WHERE id = NEW.event_id), 
      jsonb_build_object(
        'points', NEW.points_awarded,
        'placement', NEW.placement,
        'raw_score', NEW.raw_score,
        'bonus', NEW.bonus
      )
    )
  )
  ON CONFLICT (league_id, user_id) 
  DO UPDATE SET
    total_points = season_standings.total_points + EXCLUDED.total_points,
    event_breakdown = season_standings.event_breakdown || EXCLUDED.event_breakdown,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update season standings
DROP TRIGGER IF EXISTS trigger_update_season_standings ON event_results;
CREATE TRIGGER trigger_update_season_standings
  AFTER INSERT OR UPDATE ON event_results
  FOR EACH ROW
  EXECUTE FUNCTION update_season_standings();

-- Function to calculate event results
CREATE OR REPLACE FUNCTION calculate_event_results(p_event_id UUID)
RETURNS void AS $$
DECLARE
  user_record RECORD;
  user_score INTEGER;
  user_bonus INTEGER;
  user_final_score INTEGER;
  user_placement INTEGER := 1;
  prev_score INTEGER := -9999;
BEGIN
  -- Clear existing results for this event
  DELETE FROM event_results WHERE event_id = p_event_id;
  
  -- Calculate results for each user
  FOR user_record IN 
    SELECT DISTINCT user_id FROM lineups WHERE event_id = p_event_id
  LOOP
    -- Calculate raw score (sum of starter scores)
    SELECT COALESCE(SUM(gs.total_score), 0)
    INTO user_score
    FROM lineups l
    JOIN golfer_scores gs ON l.golfer_id = gs.golfer_id
    WHERE l.event_id = p_event_id 
      AND l.user_id = user_record.user_id 
      AND l.is_starter = true
      AND gs.status IN ('made_cut', 'playing', 'complete');
    
    -- Calculate bonus (10 points per starter who makes cut)
    SELECT COALESCE(COUNT(*) * 10, 0)
    INTO user_bonus
    FROM lineups l
    JOIN golfer_scores gs ON l.golfer_id = gs.golfer_id
    WHERE l.event_id = p_event_id 
      AND l.user_id = user_record.user_id 
      AND l.is_starter = true
      AND gs.status = 'made_cut';
    
    user_final_score := user_score - user_bonus;
    
    -- Insert result
    INSERT INTO event_results (event_id, user_id, raw_score, bonus, final_score)
    VALUES (p_event_id, user_record.user_id, user_score, user_bonus, user_final_score);
  END LOOP;
  
  -- Update placements
  user_placement := 1;
  FOR user_record IN 
    SELECT user_id, final_score FROM event_results 
    WHERE event_id = p_event_id 
    ORDER BY final_score ASC
  LOOP
    IF user_record.final_score != prev_score THEN
      user_placement := user_placement;
    END IF;
    
    UPDATE event_results 
    SET placement = user_placement
    WHERE event_id = p_event_id AND user_id = user_record.user_id;
    
    prev_score := user_record.final_score;
    user_placement := user_placement + 1;
  END LOOP;
  
  -- Update event status to complete
  UPDATE events SET status = 'complete' WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get league draft order
CREATE OR REPLACE FUNCTION get_draft_order(p_league_id UUID)
RETURNS TABLE(user_id UUID, draft_position INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT lm.user_id, lm.draft_position
  FROM league_members lm
  WHERE lm.league_id = p_league_id
  ORDER BY lm.draft_position;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's current lineup for an event
CREATE OR REPLACE FUNCTION get_user_lineup(p_event_id UUID, p_user_id UUID)
RETURNS TABLE(golfer_id UUID, is_starter BOOLEAN, golfer_name TEXT, total_score INTEGER, status TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.golfer_id,
    l.is_starter,
    g.name,
    gs.total_score,
    gs.status
  FROM lineups l
  JOIN golfers g ON l.golfer_id = g.id
  LEFT JOIN golfer_scores gs ON l.golfer_id = gs.golfer_id AND l.event_id = gs.event_id
  WHERE l.event_id = p_event_id AND l.user_id = p_user_id
  ORDER BY l.is_starter DESC, g.name;
END;
$$ LANGUAGE plpgsql;

-- Function to get league standings
CREATE OR REPLACE FUNCTION get_league_standings(p_league_id UUID)
RETURNS TABLE(user_id UUID, display_name TEXT, total_points INTEGER, event_count INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ss.user_id,
    u.display_name,
    ss.total_points,
    jsonb_array_length(ss.event_breakdown)
  FROM season_standings ss
  JOIN users u ON ss.user_id = u.id
  WHERE ss.league_id = p_league_id
  ORDER BY ss.total_points DESC;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- SAMPLE DATA (Optional - Uncomment to seed)
-- ========================================

-- Insert sample golfers (you can modify or remove this section)
/*
INSERT INTO golfers (name, tour, world_ranking, country) VALUES
('Scottie Scheffler', 'PGA Tour', 1, 'USA'),
('Rory McIlroy', 'PGA Tour', 2, 'NIR'),
('Jon Rahm', 'PGA Tour', 3, 'ESP'),
('Viktor Hovland', 'PGA Tour', 4, 'NOR'),
('Cameron Smith', 'PGA Tour', 5, 'AUS'),
('Patrick Cantlay', 'PGA Tour', 6, 'USA'),
('Justin Thomas', 'PGA Tour', 7, 'USA'),
('Xander Schauffele', 'PGA Tour', 8, 'USA'),
('Collin Morikawa', 'PGA Tour', 9, 'USA'),
('Brooks Koepka', 'PGA Tour', 10, 'USA');
*/

-- ========================================
-- SCHEDULED JOBS (Optional - Uncomment if using pg_cron)
-- ========================================

-- Schedule score updates every 15 minutes during tournament season
-- SELECT cron.schedule('update-golf-scores', '*/15 * * * *', $$SELECT update_golfer_scores_from_api();$$);

-- Schedule daily cleanup of old draft data
-- SELECT cron.schedule('cleanup-old-drafts', '0 2 * * *', $$DELETE FROM draft_picks WHERE picked_at < NOW() - INTERVAL '1 year';$$);

-- ========================================
-- VIEWS (Optional - For easier querying)
-- ========================================

-- View for current league information
CREATE OR REPLACE VIEW league_info AS
SELECT 
  l.id,
  l.name,
  l.status,
  l.season_year,
  l.max_members,
  COUNT(lm.user_id) as current_members,
  u.display_name as commissioner_name
FROM leagues l
JOIN users u ON l.commissioner_id = u.id
LEFT JOIN league_members lm ON l.id = lm.league_id
GROUP BY l.id, u.display_name;

-- View for event leaderboard
CREATE OR REPLACE VIEW event_leaderboard AS
SELECT 
  er.event_id,
  e.name as event_name,
  er.user_id,
  u.display_name,
  er.raw_score,
  er.bonus,
  er.final_score,
  er.placement,
  er.points_awarded
FROM event_results er
JOIN events e ON er.event_id = e.id
JOIN users u ON er.user_id = u.id
ORDER BY er.event_id, er.final_score ASC;

-- View for user draft picks summary
CREATE OR REPLACE VIEW user_draft_summary AS
SELECT 
  dp.league_id,
  dp.user_id,
  u.display_name,
  COUNT(dp.golfer_id) as picks_made,
  STRING_AGG(g.name, ', ' ORDER BY dp.pick_number) as golfer_names
FROM draft_picks dp
JOIN users u ON dp.user_id = u.id
JOIN golfers g ON dp.golfer_id = g.id
GROUP BY dp.league_id, dp.user_id, u.display_name
ORDER BY dp.league_id, dp.user_id;