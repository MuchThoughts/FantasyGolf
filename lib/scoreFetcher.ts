import { scoreApi, eventApi } from './api'

interface ESPNGolfer {
  id: string
  displayName: string
  shortName: string
  position: {
    abbreviation: string
  }
  score: {
    relativeToPar: number
    total: number
  }
  status: {
    displayValue: string
  }
  rounds: Array<{
    number: number
    score: number
  }>
}

interface ESPNTournament {
  id: string
  name: string
  leaderboard: {
    golfers: ESPNGolfer[]
  }
}

export class ScoreFetcher {
  private static readonly ESPN_API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard'

  static async fetchScores(eventId: string): Promise<void> {
    try {
      const event = await this.getEvent(eventId)
      if (!event?.api_tournament_id) {
        console.log('No tournament ID mapped for event:', eventId)
        return
      }

      const espnData = await this.fetchESPNTournament(event.api_tournament_id)
      if (!espnData) return

      // Process each golfer's scores
      for (const espnGolfer of espnData.leaderboard.golfers) {
        const golferId = await this.matchGolfer(espnGolfer.displayName)
        if (!golferId) continue

        const scores = this.parseGolferScores(espnGolfer)
        
        await scoreApi.update(eventId, golferId, {
          round_1: scores.round_1,
          round_2: scores.round_2,
          round_3: scores.round_3,
          round_4: scores.round_4,
          total_score: scores.total_score,
          relative_to_par: scores.relative_to_par,
          status: scores.status
        })
      }

      console.log('Scores updated successfully for event:', eventId)
    } catch (error) {
      console.error('Error fetching scores:', error)
    }
  }

  private static async getEvent(eventId: string) {
    const { data } = await eventApi.get(eventId)
    return data
  }

  private static async fetchESPNTournament(tournamentId: string): Promise<ESPNTournament | null> {
    try {
      const response = await fetch(`${this.ESPN_API_BASE}?tournamentId=${tournamentId}`)
      if (!response.ok) return null
      
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error fetching ESPN data:', error)
      return null
    }
  }

  private static async matchGolfer(espnName: string): Promise<string | null> {
    // This would implement fuzzy matching against the golfers table
    // For now, return null to skip
    return null
  }

  private static parseGolferScores(espnGolfer: ESPNGolfer) {
    const rounds = espnGolfer.rounds || []
    
    return {
      round_1: rounds[0]?.score ?? null,
      round_2: rounds[1]?.score ?? null,
      round_3: rounds[2]?.score ?? null,
      round_4: rounds[3]?.score ?? null,
      total_score: espnGolfer.score.total,
      relative_to_par: espnGolfer.score.relativeToPar,
      status: this.mapStatus(espnGolfer.status.displayValue)
    }
  }

  private static mapStatus(espnStatus: string): string {
    const statusMap: Record<string, string> = {
      'In Progress': 'playing',
      'Completed': 'made_cut',
      'Cut': 'missed_cut',
      'WD': 'wd',
      'DQ': 'dq'
    }
    
    return statusMap[espnStatus] || 'pending'
  }
}

// Vercel Cron Job function
export async function updateScores() {
  // This would be called by Vercel Cron every 5 minutes during tournament days
  // Implementation would fetch all active events and update their scores
}