import * as admin from 'firebase-admin'

let initialized = false

function getApp() {
  if (!initialized) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) })
    initialized = true
  }
  return admin.app()
}

export async function sendPush(token: string, title: string, body: string, data?: Record<string, string>) {
  try {
    await getApp().messaging().send({ token, notification: { title, body }, data })
  } catch (err) {
    console.error('FCM error:', err)
  }
}
