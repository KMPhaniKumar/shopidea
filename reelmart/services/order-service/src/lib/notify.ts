export function notifyOrderUpdate(orderId: string, status: string, buyerPhone: string, storeName: string, buyerId?: string) {
  fetch(`${process.env.NOTIFICATION_SERVICE_URL}/api/notifications/order-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY! },
    body: JSON.stringify({ orderId, status, buyerPhone, storeName, buyerId }),
  }).catch(() => {})
}
