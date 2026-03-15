import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { auth, userApi } from '../../lib/auth'
import { leagueApi } from '../../lib/api'
import { LeagueCard } from '../../components/LeagueCard'
import { LeagueForm } from '../../components/LeagueForm'
import { Button } from '../../components/ui/Button'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [leagues, setLeagues] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await auth.getCurrentUser()
      if (!currentUser) {
        router.push('/signin')
        return
      }
      setUser(currentUser)
      
      // Fetch user leagues
      const { data, error } = await leagueApi.list(currentUser.id)
      if (error) {
        console.error('Error fetching leagues:', error)
      } else {
        setLeagues(data || [])
      }
      setLoading(false)
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Cancel' : 'Create League'}
        </Button>
      </div>

      {showCreateForm && (
        <div className="mb-8">
          <LeagueForm />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {leagues.map((league) => (
          <LeagueCard key={league.id} league={league} />
        ))}
      </div>

      {leagues.length === 0 && !showCreateForm && (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">You haven't joined any leagues yet.</p>
          <Button onClick={() => setShowCreateForm(true)}>
            Create Your First League
          </Button>
        </div>
      )}
    </div>
  )
}