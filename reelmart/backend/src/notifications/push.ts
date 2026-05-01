import admin from 'firebase-admin'
import { supabaseAdmin } from '../lib/supabaseAdmin'

let initialized = false

function getFirebaseApp() {
  if (!initialized) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
      ),
    })
    initialized = true
  }
  return admin
}

export async function sendPushToUser(userId: string, title: string, body: string, data?: Record<string, string>) {
  const { data: tokens } = await supabaseAdmin
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId)

  if (!tokens || tokens.length === 0) return

  const app = getFirebaseApp()
  const messaging = app.messaging()

  const messages = tokens.map(({ token }) =>
    messaging.send({
      token,
      notification: { title, body },
      data: data || {},
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    })
  )

  await Promise.allSettled(messages)
}
