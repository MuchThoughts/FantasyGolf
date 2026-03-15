import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { leagueApi } from '../lib/api'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Label } from './ui/Label'

export function LeagueForm() {
  const [name, setName] = useState('')
  const [maxMembers, setMaxMembers] = useState('6')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const user = await supabase.auth.getUser()
      if (!user.data.user) throw new Error('Not authenticated')

      const { data, error } = await leagueApi.create(
        name,
        user.data.user.id,
        parseInt(maxMembers),
        new Date().getFullYear()
      )

      if (error) throw error

      router.push(`/leagues/${data?.id}`)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">Create League</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">League Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="maxMembers">Maximum Members</Label>
          <Input
            id="maxMembers"
            type="number"
            min="5"
            max="12"
            value={maxMembers}
            onChange={(e) => setMaxMembers(e.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating...' : 'Create League'}
        </Button>
      </form>
    </div>
  )
}