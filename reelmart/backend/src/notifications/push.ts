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

export const pushNotify = {
  newOrder: (userId: string, orderNumber: string) =>
    sendPushToUser(userId, '🛍️ New Order!', `Order ${orderNumber} needs your attention`, { type: 'new_order', order_number: orderNumber }).catch(() => {}),

  orderStatusUpdate: (userId: string, status: string, orderNumber: string) =>
    sendPushToUser(userId, 'Order Update', `Your order ${orderNumber} is now ${status}`, { type: 'order_status', order_number: orderNumber, status }).catch(() => {}),
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
