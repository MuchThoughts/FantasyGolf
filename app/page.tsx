import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 via-green-500 to-green-600">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-6xl font-bold text-white mb-6">
            Fantasy Golf
          </h1>
          <p className="text-xl text-green-100 mb-8">
            Compete in fantasy golf leagues across the four majors
          </p>
          
          <div className="space-y-4">
            <Link
              href="/dashboard"
              className="inline-block bg-white text-green-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-green-50 transition-colors"
            >
              Get Started
            </Link>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                <h3 className="text-white font-semibold mb-2">Draft Teams</h3>
                <p className="text-green-100 text-sm">
                  Build your roster of 6 professional golfers from the PGA Tour, DP World Tour, and LIV Golf
                </p>
              </div>
              
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                <h3 className="text-white font-semibold mb-2">Weekly Lineups</h3>
                <p className="text-green-100 text-sm">
                  Select 4 of your 6 golfers to start each major tournament
                </p>
              </div>
              
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                <h3 className="text-white font-semibold mb-2">Track Scores</h3>
                <p className="text-green-100 text-sm">
                  Watch your team's performance in real-time as the majors unfold
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}