import React, { useState, useEffect } from 'react'
import { draftApi, golferApi, leagueApi } from '../lib/api'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Label } from './ui/Label'

interface DraftBoardProps {
  leagueId: string
}

export function DraftBoard({ leagueId }: DraftBoardProps) {
  const [picks, setPicks] = useState<any[]>([])
  const [availableGolfers, setAvailableGolfers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedGolfer, setSelectedGolfer] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      
      // Fetch draft picks
      const { data: picksData } = await draftApi.getPicks(leagueId)
      setPicks(picksData || [])

      // Fetch available golfers
      const { data: golfersData } = await golferApi.list()
      setAvailableGolfers(golfersData || [])

      setLoading(false)
    }

    fetchData()
  }, [leagueId])

  const filteredGolfers = availableGolfers.filter(golfer =>
    golfer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    golfer.tour.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handlePick = async () => {
    if (!selectedGolfer) return

    const nextPickNumber = picks.length + 1
    const { data, error } = await draftApi.makePick(
      leagueId,
      'current-user-id', // This would come from auth context
      selectedGolfer,
      nextPickNumber
    )

    if (!error) {
      // Refresh data
      const { data: picksData } = await draftApi.getPicks(leagueId)
      setPicks(picksData || [])
      setSelectedGolfer(null)
    }
  }

  if (loading) {
    return <div>Loading draft board...</div>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Draft Board */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Draft Board</h2>
          <div className="space-y-2">
            {picks.map((pick, index) => (
              <div key={pick.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span className="font-medium">
                  {index + 1}. {pick.users?.display_name}
                </span>
                <span className="text-gray-600">
                  {pick.golfers?.name} ({pick.golfers?.tour})
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Available Golfers */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Available Golfers</h2>
          
          <div className="mb-4">
            <Label htmlFor="search">Search Golfers</Label>
            <Input
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or tour..."
            />
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredGolfers.map((golfer) => (
              <div
                key={golfer.id}
                className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                  selectedGolfer === golfer.id ? 'border-green-500 bg-green-50' : 'border-gray-200'
                }`}
                onClick={() => setSelectedGolfer(golfer.id)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{golfer.name}</span>
                    <span className="text-sm text-gray-600 ml-2">{golfer.tour}</span>
                  </div>
                  {golfer.world_ranking && (
                    <span className="text-sm text-gray-500">#{golfer.world_ranking}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={handlePick} disabled={!selectedGolfer}>
              Make Pick
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}