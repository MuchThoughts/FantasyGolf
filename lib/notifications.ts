import { supabase } from './supabase'

export interface Notification {
  id: string
  user_id: string
  type: 'draft_pick' | 'lineup_reminder' | 'event_start' | 'event_complete'
  title: string
  message: string
  read: boolean
  created_at: string
}

export const notificationApi = {
  create: async (notification: Omit<Notification, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('notifications')
      .insert(notification)
      .select()
      .single()
    return { data, error }
  },

  list: async (userId: string) => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    return { data, error }
  },

  markAsRead: async (notificationId: string) => {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .select()
      .single()
    return { data, error }
  }
}

// Email notification functions (would integrate with email service)
export const emailNotifications = {
  sendDraftPickReminder: async (email: string, leagueName: string, pickNumber: number) => {
    // Implementation would send email via service like Resend, SendGrid, etc.
    console.log(`Sending draft pick reminder to ${email} for ${leagueName}, pick ${pickNumber}`)
  },

  sendLineupReminder: async (email: string, leagueName: string, eventName: string) => {
    // Implementation would send email via service like Resend, SendGrid, etc.
    console.log(`Sending lineup reminder to ${email} for ${leagueName} - ${eventName}`)
  },

  sendEventResults: async (email: string, leagueName: string, eventName: string, standings: any[]) => {
    // Implementation would send email via service like Resend, SendGrid, etc.
    console.log(`Sending event results to ${email} for ${leagueName} - ${eventName}`)
  }
}