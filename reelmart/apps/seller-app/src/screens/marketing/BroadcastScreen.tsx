import React, { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, FlatList, ActivityIndicator,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useSellerStore } from '../../store/sellerStore'
import { BroadcastRecord, getBroadcastHistory, sendBroadcast } from '../../services/couponService'

type Props = { navigation: NativeStackNavigationProp<any> }

function BroadcastCard({ record }: { record: BroadcastRecord }) {
  const date = new Date(record.sent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <View style={styles.broadcastCard}>
      <View style={styles.broadcastMeta}>
        <Text style={styles.broadcastDate}>{date}</Text>
        <Text style={styles.broadcastCount}>📨 {record.recipient_count} sent</Text>
      </View>
      <Text style={styles.broadcastMsg} numberOfLines={3}>{record.message}</Text>
    </View>
  )
}

export default function BroadcastScreen({ navigation }: Props) {
  const store = useSellerStore(s => s.store)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState<BroadcastRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!store?.id) return
    getBroadcastHistory(store.id).then(data => {
      setHistory(data)
      setLoading(false)
    })
  }, [store?.id])

  async function handleSend() {
    if (!store?.id) return
    if (!message.trim()) { Alert.alert('Error', 'Enter a message to broadcast'); return }
    if (message.trim().length < 10) { Alert.alert('Error', 'Message is too short'); return }

    Alert.alert(
      'Send Broadcast?',
      'This will send a WhatsApp message to all your past customers. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send', onPress: async () => {
            setSending(true)
            const result = await sendBroadcast(store.id!, message.trim())
            setSending(false)
            if (result.success) {
              Alert.alert('Sent!', `Message delivered to ${result.count} customers`)
              setMessage('')
              getBroadcastHistory(store.id!).then(setHistory)
            } else {
              Alert.alert('Error', result.error ?? 'Failed to send broadcast')
            }
          },
        },
      ]
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Broadcast</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Compose area */}
      <View style={styles.compose}>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>📢 Send a WhatsApp message to all your past customers at once</Text>
        </View>
        <Text style={styles.fieldLabel}>Your Message</Text>
        <TextInput
          style={styles.msgInput}
          value={message}
          onChangeText={setMessage}
          placeholder="e.g. 🎉 50% OFF today only! Visit our store: reelmart.in/s/your-store"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{message.length}/500</Text>
        <TouchableOpacity
          style={[styles.sendBtn, (sending || !message.trim()) && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={sending || !message.trim()}
        >
          <Text style={styles.sendBtnText}>{sending ? 'Sending...' : '📤 Send Broadcast'}</Text>
        </TouchableOpacity>
      </View>

      {/* History */}
      <Text style={styles.historyTitle}>Past Broadcasts</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : history.length === 0 ? (
        <Text style={styles.historyEmpty}>No broadcasts sent yet</Text>
      ) : (
        <FlatList
          data={history}
          keyExtractor={r => r.id}
          renderItem={({ item }) => <BroadcastCard record={item} />}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  compose: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoBox: {
    backgroundColor: '#EFF6FF', borderRadius: radius.sm,
    padding: spacing.sm, marginBottom: spacing.sm,
    borderLeftWidth: 3, borderLeftColor: '#3B82F6',
  },
  infoText: { fontSize: 13, color: '#1D4ED8' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  msgInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: 15, color: colors.textPrimary,
    minHeight: 100, maxHeight: 200,
  },
  charCount: { fontSize: 12, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
  sendBtn: {
    backgroundColor: '#25D366', borderRadius: radius.pill,
    height: 50, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm,
  },
  sendBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  historyTitle: {
    fontSize: 14, fontWeight: '700', color: colors.textMuted,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  historyEmpty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  broadcastCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm, marginBottom: spacing.sm,
  },
  broadcastMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  broadcastDate: { fontSize: 12, color: colors.textMuted },
  broadcastCount: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  broadcastMsg: { fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
})
