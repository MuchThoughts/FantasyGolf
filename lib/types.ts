// User types
export interface User {
  id: string
  display_name: string
  email: string
  created_at: string
}

// League types
export interface League {
  id: string
  name: string
  commissioner_id: string
  status: 'draft_pending' | 'draft_in_progress' | 'draft_complete' | 'season_active' | 'season_complete'
  pick_deadline_hours: number
  season_year: number
  max_members: number
  created_at: string
  league_members?: LeagueMember[]
}

export interface LeagueMember {
  league_id: string
  user_id: string
  draft_position: number | null
  users?: User
}

// Golfer types
export interface Golfer {
  id: string
  name: string
  tour: 'PGA Tour' | 'DP World Tour' | 'LIV Golf'
  world_ranking: number | null
  country: string | null
  created_at: string
}

// Draft types
export interface DraftPick {
  id: string
  league_id: string
  user_id: string
  golfer_id: string
  pick_number: number
  picked_at: string
  is_auto_pick: boolean
  users?: User
  golfers?: Golfer
}

// Event types
export interface Event {
  id: string
  league_id: string
  name: string
  year: number
  status: 'upcoming' | 'in_progress' | 'complete'
  lineup_lock_time: string | null
  api_tournament_id: string | null
  created_at: string
}

// Lineup types
export interface Lineup {
  id: string
  event_id: string
  user_id: string
  golfer_id: string
  is_starter: boolean
  created_at: string
  golfers?: Golfer
}

// Score types
export interface GolferScore {
  id: string
  event_id: string
  golfer_id: string
  round_1: number | null
  round_2: number | null
  round_3: number | null
  round_4: number | null
  total_score: number | null
  relative_to_par: number | null
  status: 'pending' | 'playing' | 'made_cut' | 'missed_cut' | 'wd' | 'dq'
  updated_at: string
  golfers?: Golfer
}

// Event result types
export interface EventResult {
  id: string
  event_id: string
  user_id: string
  raw_score: number | null
  bonus: number
  final_score: number | null
  placement: number | null
  points_awarded: number | null
  calculated_at: string
}

// Season standings types
export interface SeasonStandings {
  id: string
  league_id: string
  user_id: string
  total_points: number
  event_breakdown: Record<string, number>
  updated_at: string
  users?: User
}