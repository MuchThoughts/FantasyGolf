import React from 'react'
import Link from 'next/link'
import { Button } from './ui/Button'

interface LeagueCardProps {
  league: {
    id: string
    name: string
    status: string
    season_year: number
    league_members: Array<{
      users: { display_name: string }
    }>
  }
}

export function LeagueCard({ league }: LeagueCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-2">{league.name}</h3>
      <p className="text-gray-600 mb-4">Season {league.season_year}</p>
      
      <div className="mb-4">
        <span className={`px-2 py-1 rounded-full text-sm ${
          league.status === 'draft_pending' ? 'bg-yellow-100 text-yellow-800' :
          league.status === 'draft_in_progress' ? 'bg-blue-100 text-blue-800' :
          league.status === 'draft_complete' ? 'bg-green-100 text-green-800' :
          league.status === 'season_active' ? 'bg-purple-100 text-purple-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {league.status.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      <div className="mb-4">
        <h4 className="font-medium mb-2">Members:</h4>
        <ul className="space-y-1">
          {league.league_members.map((member, index) => (
            <li key={index} className="text-sm text-gray-700">
              {member.users.display_name}
            </li>
          ))}
        </ul>
      </div>

      <Link href={`/leagues/${league.id}`}>
        <Button>View League</Button>
      </Link>
    </div>
  )
}