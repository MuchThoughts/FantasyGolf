import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '../lib/auth'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Label } from './ui/Label'

interface AuthFormProps {
  mode: 'signup' | 'signin'
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === 'signup') {
        const { error } = await auth.signUp(email, password, displayName)
        if (error) throw error
      } else {
        const { error } = await auth.signIn(email, password)
        if (error) throw error
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">
        {mode === 'signup' ? 'Sign Up' : 'Sign In'}
      </h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
        )}
        
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Loading...' : mode === 'signup' ? 'Sign Up' : 'Sign In'}
        </Button>
      </form>

      <div className="mt-4 text-center">
        {mode === 'signup' ? (
          <p>
            Already have an account?{' '}
            <a href="/signin" className="text-green-600 hover:text-green-700">
              Sign In
            </a>
          </p>
        ) : (
          <p>
            Don't have an account?{' '}
            <a href="/signup" className="text-green-600 hover:text-green-700">
              Sign Up
            </a>
          </p>
        )}
      </div>
    </div>
  )
}