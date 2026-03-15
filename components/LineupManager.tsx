import React, { useState, useEffect } from 'react'
import { lineupApi, leagueApi } from '../lib/api'
import { Button } from './ui/Button'
import { Label } from './ui/Label'

interface LineupManagerProps {
  leagueId: string
  eventId: string
}

export function LineupManager({ leagueId, eventId }: LineupManagerProps) {
  const [team, setTeam] = useState<any[]>([])
  const [selectedStarters, setSelectedStarters] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTeam = async () => {
      setLoading(true)
      // This would fetch the user's drafted team for this league
      // For now, mock data
      setTeam([
        { id: '1', name: 'Tiger Woods', tour: 'PGA Tour' },
        { id: '2', name: 'Rory McIlroy', tour: 'PGA Tour' },
        { id: '3', name: 'Jon Rahm', tour: 'DP World Tour' },
        { id: '4', name: 'Brooks Koepka', tour: 'LIV Golf' },
        { id: '5', name: 'Jordan Spieth', tour: 'PGA Tour' },
        { id: '6', name: 'Dustin Johnson', tour: 'LIV Golf' }
      ])
      setLoading(false)
    }

    fetchTeam()
  }, [leagueId, eventId])

  const handleToggleStarter = (golferId: string) => {
    setSelectedStarters(prev => {
      if (prev.includes(golferId)) {
        return prev.filter(id => id !== golferId)
      } else if (prev.length < 4) {
        return [...prev, golferId]
      }
      return prev
    })
  }

  const handleSubmitLineup = async () => {
    const { error } = await lineupApi.set(eventId, 'current-user-id', selectedStarters)
    if (!error) {
      alert('Lineup submitted successfully!')
    }
  }

  if (loading) {
    return <div>Loading team...</div>
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-4">Set Your Lineup</h2>
      <p className="text-gray-600 mb-4">Select 4 golfers to start this event</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {team.map((golfer) => (
          <div
            key={golfer.id}
            className={`p-4 border rounded cursor-pointer hover:bg-gray-50 ${
              selectedStarters.includes(golfer.id) 
                ? 'border-green-500 bg-green-50' 
                : 'border-gray-200'
            }`}
            onClick={() => handleToggleStarter(golfer.id)}
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="font-medium">{golfer.name}</span>
                <span className="text-sm text-gray-600 ml-2">{golfer.tour}</span>
              </div>
              {selectedStarters.includes(golfer.id) && (
                <span className="text-green-600 font-bold">STARTER</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">
          Selected: {selectedStarters.length}/4
        </span>
        <Button 
          onClick={handleSubmitLineup} 
          disabled={selectedStarters.length !== 4}
        >
          Submit Lineup
        </Button>
      </div>
    </div>
  )
}