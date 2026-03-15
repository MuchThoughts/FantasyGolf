import React, { useState, useEffect } from 'react'
import { leagueApi, eventApi } from '../lib/api'
import { Button } from './ui/Button'

interface SeasonStandingsProps {
  leagueId: string
}

export function SeasonStandings({ leagueId }: SeasonStandingsProps) {
  const [standings, setStandings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStandings = async () => {
      setLoading(true)
      
      // This would fetch season standings from the database
      // For now, mock data
      setStandings([
        { user_id: '1', display_name: 'Player 1', total_points: 45, events: { '1': 15, '2': 12, '3': 10, '4': 8 } },
        { user_id: '2', display_name: 'Player 2', total_points: 38, events: { '1': 12, '2': 10, '3': 8, '4': 8 } },
        { user_id: '3', display_name: 'Player 3', total_points: 32, events: { '1': 10, '2': 8, '3': 6, '4': 8 } }
      ])
      
      setLoading(false)
    }

    fetchStandings()
  }, [leagueId])

  if (loading) {
    return <div>Loading standings...</div>
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-4">Season Standings</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Position</th>
              <th className="text-left p-2">Player</th>
              <th className="text-right p-2">Event 1</th>
              <th className="text-right p-2">Event 2</th>
              <th className="text-right p-2">Event 3</th>
              <th className="text-right p-2">Event 4</th>
              <th className="text-right p-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, index) => (
              <tr key={standing.user_id} className="border-b hover:bg-gray-50">
                <td className="p-2 font-bold">{index + 1}</td>
                <td className="p-2">{standing.display_name}</td>
                <td className="p-2 text-right">{standing.events['1'] || 0}</td>
                <td className="p-2 text-right">{standing.events['2'] || 0}</td>
                <td className="p-2 text-right">{standing.events['3'] || 0}</td>
                <td className="p-2 text-right">{standing.events['4'] || 0}</td>
                <td className="p-2 text-right font-bold">{standing.total_points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}