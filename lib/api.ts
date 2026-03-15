import { supabase } from './supabase'
import type { User, League, LeagueMember, Golfer, DraftPick, Event, Lineup, GolferScore, EventResult } from './types'

// User API
export const userApi = {
  create: async (email: string, displayName: string): Promise<{ data: User | null; error: any }> => {
    const { data, error } = await supabase
      .from('users')
      .insert({ email, display_name: displayName })
      .select()
      .single()
    return { data, error }
  },

  update: async (id: string, updates: Partial<{ display_name: string }>): Promise<{ data: User | null; error: any }> => {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    return { data, error }
  }
}

// League API
export const leagueApi = {
  create: async (name: string, commissionerId: string, maxMembers: number, seasonYear: number): Promise<{ data: League | null; error: any }> => {
    const { data, error } = await supabase
      .from('leagues')
      .insert({
        name,
        commissioner_id: commissionerId,
        max_members: maxMembers,
        season_year: seasonYear
      })
      .select()
      .single()
    return { data, error }
  },

  join: async (leagueId: string, userId: string): Promise<{ data: any; error: any }> => {
    const { data, error } = await supabase
      .from('league_members')
      .insert({ league_id: leagueId, user_id: userId })
    return { data, error }
  },

  get: async (leagueId: string): Promise<{ data: League | null; error: any }> => {
    const { data, error } = await supabase
      .from('leagues')
      .select(`
        *,
        league_members (
          user_id,
          users (display_name)
        )
      `)
      .eq('id', leagueId)
      .single()
    return { data, error }
  },

  list: async (userId: string): Promise<{ data: League[] | null; error: any }> => {
    const { data: leagueIds, error: leagueError } = await supabase
      .from('league_members')
      .select('league_id')
      .eq('user_id', userId)

    if (leagueError) return { data: null, error: leagueError }

    const { data, error } = await supabase
      .from('leagues')
      .select(`
        *,
        league_members (
          user_id,
          users (display_name)
        )
      `)
      .in('id', leagueIds.map(l => l.league_id))
    return { data, error }
  }
}

// Golfer API
export const golferApi = {
  list: async () => {
    const { data, error } = await supabase
      .from('golfers')
      .select('*')
      .order('world_ranking', { ascending: true })
    return { data, error }
  },

  add: async (name: string, tour: string, worldRanking?: number, country?: string) => {
    const { data, error } = await supabase
      .from('golfers')
      .insert({ name, tour, world_ranking: worldRanking, country })
      .select()
      .single()
    return { data, error }
  }
}

// Draft API
export const draftApi = {
  getPicks: async (leagueId: string) => {
    const { data, error } = await supabase
      .from('draft_picks')
      .select(`
        *,
        users (display_name),
        golfers (name, tour)
      `)
      .eq('league_id', leagueId)
      .order('pick_number', { ascending: true })
    return { data, error }
  },

  makePick: async (leagueId: string, userId: string, golferId: string, pickNumber: number) => {
    const { data, error } = await supabase
      .from('draft_picks')
      .insert({
        league_id: leagueId,
        user_id: userId,
        golfer_id: golferId,
        pick_number: pickNumber
      })
      .select()
      .single()
    return { data, error }
  }
}

// Event API
export const eventApi = {
  list: async (leagueId: string) => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('league_id', leagueId)
      .order('name', { ascending: true })
    return { data, error }
  },

  get: async (eventId: string) => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()
    return { data, error }
  },

  updateStatus: async (eventId: string, status: string) => {
    const { data, error } = await supabase
      .from('events')
      .update({ status })
      .eq('id', eventId)
      .select()
      .single()
    return { data, error }
  }
}

// Lineup API
export const lineupApi = {
  get: async (eventId: string, userId: string) => {
    const { data, error } = await supabase
      .from('lineups')
      .select(`
        *,
        golfers (name, tour)
      `)
      .eq('event_id', eventId)
      .eq('user_id', userId)
    return { data, error }
  },

  set: async (eventId: string, userId: string, golferIds: string[]) => {
    // Delete existing lineup
    await supabase
      .from('lineups')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId)

    // Insert new lineup
    const { data, error } = await supabase
      .from('lineups')
      .insert(
        golferIds.map((golferId, index) => ({
          event_id: eventId,
          user_id: userId,
          golfer_id: golferId,
          is_starter: index < 4
        }))
      )
    return { data, error }
  }
}

// Score API
export const scoreApi = {
  get: async (eventId: string) => {
    const { data, error } = await supabase
      .from('golfer_scores')
      .select(`
        *,
        golfers (name, tour)
      `)
      .eq('event_id', eventId)
    return { data, error }
  },

  update: async (eventId: string, golferId: string, scores: Partial<{
    round_1: number;
    round_2: number;
    round_3: number;
    round_4: number;
    total_score: number;
    relative_to_par: number;
    status: string;
  }>) => {
    const { data, error } = await supabase
      .from('golfer_scores')
      .upsert({
        event_id: eventId,
        golfer_id: golferId,
        ...scores,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    return { data, error }
  }
}