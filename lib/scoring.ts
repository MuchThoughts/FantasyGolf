import type { GolferScore, Lineup, EventResult } from './types'

export interface TeamScore {
  userId: string
  rawScore: number
  droppedScore: number
  finalScore: number
  bonus: number
  placement: number
  points: number
}

export function calculateTeamScore(lineup: Lineup[], scores: GolferScore[]): TeamScore {
  // Get scores for the 4 starters
  const starterScores = lineup
    .filter(l => l.is_starter)
    .map(l => {
      const score = scores.find(s => s.golfer_id === l.golfer_id)
      return score?.relative_to_par ?? 0 // Default to 0 if no score yet
    })

  // Sort scores ascending (best to worst)
  const sortedScores = [...starterScores].sort((a, b) => a - b)
  
  // Drop the worst score (highest number)
  const droppedScore = sortedScores.pop() || 0
  
  // Sum the remaining 3 scores
  const rawScore = sortedScores.reduce((sum, score) => sum + score, 0)
  
  // Apply bonus for tournament winner (handled separately)
  const bonus = 0 // This would be calculated based on if any starter won the tournament
  
  const finalScore = rawScore + bonus

  return {
    userId: lineup[0]?.user_id || '',
    rawScore,
    droppedScore,
    finalScore,
    bonus,
    placement: 0, // Calculated when ranking all teams
    points: 0 // Calculated based on placement
  }
}

export function calculateEventResults(teamScores: TeamScore[]): EventResult[] {
  // Sort by final score ascending (lowest wins)
  const sortedTeams = [...teamScores].sort((a, b) => a.finalScore - b.finalScore)
  
  // Assign placements
  sortedTeams.forEach((team, index) => {
    team.placement = index + 1
  })

  // Calculate points based on placement
  const pointsTable = {
    1: 15,
    2: 12,
    3: 10,
    4: 8,
    5: 6,
    6: 5,
    7: 4,
    8: 3,
    9: 2,
    10: 1
  }

  sortedTeams.forEach(team => {
    team.points = pointsTable[team.placement as keyof typeof pointsTable] || 1
  })

  return sortedTeams.map(team => ({
    id: '',
    event_id: '',
    user_id: team.userId,
    raw_score: team.rawScore,
    bonus: team.bonus,
    final_score: team.finalScore,
    placement: team.placement,
    points_awarded: team.points,
    calculated_at: new Date().toISOString()
  }))
}

export function calculateSeasonStandings(eventResults: EventResult[]): Record<string, number> {
  const standings: Record<string, number> = {}

  eventResults.forEach(result => {
    if (!standings[result.user_id]) {
      standings[result.user_id] = 0
    }
    standings[result.user_id] += result.points_awarded || 0
  })

  return standings
}