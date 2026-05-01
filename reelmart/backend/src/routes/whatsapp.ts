import { Router } from 'express'

export const whatsappRouter = Router()

// Gupshup webhook — WhatsApp bot handled in separate whatsapp/bot.ts
// This is a placeholder for the bot route mounted later in agent_13
whatsappRouter.get('/webhook', (_req, res) => {
  res.json({ status: 'WhatsApp webhook active' })
})
