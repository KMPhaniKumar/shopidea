import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useSellerStore } from '../../store/sellerStore'
import { supabase } from '../../lib/supabase'

type Props = { navigation: NativeStackNavigationProp<any> }

interface Review {
  id: string
  rating: number
  review_text: string | null
  seller_reply: string | null
  created_at: string
  users: { name: string } | null
}

function Stars({ rating }: { rating: number }) {
  return (
    <Text style={{ fontSize: 16 }}>
      {Array.from({ length: 5 }, (_, i) => i < rating ? '★' : '☆').join('')}
    </Text>
  )
}

function ReviewCard({ review, onReply }: { review: Review; onReply: (id: string) => void }) {
  const date = new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{(review.users?.name ?? 'U')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reviewerName}>{review.users?.name ?? 'Customer'}</Text>
          <Text style={styles.reviewDate}>{date}</Text>
        </View>
        <Stars rating={review.rating} />
      </View>
      {review.review_text && (
        <Text style={styles.reviewText}>{review.review_text}</Text>
      )}
      {review.seller_reply ? (
        <View style={styles.replyBox}>
          <Text style={styles.replyLabel}>Your reply:</Text>
          <Text style={styles.replyText}>{review.seller_reply}</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.replyBtn} onPress={() => onReply(review.id)}>
          <Text style={styles.replyBtnText}>Reply to review</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

export default function StoreReviewsScreen({ navigation }: Props) {
  const store = useSellerStore(s => s.store)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!store) return
    supabase
      .from('reviews')
      .select('id, rating, review_text, seller_reply, created_at, users!buyer_id(name)')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setReviews((data as any[]) ?? [])
        setLoading(false)
      })
  }, [store?.id])

  async function submitReply(reviewId: string) {
    if (!replyText.trim()) return
    setSubmitting(true)
    const { error } = await supabase
      .from('reviews')
      .update({ seller_reply: replyText.trim(), seller_replied_at: new Date().toISOString() })
      .eq('id', reviewId)
    setSubmitting(false)
    if (error) { Alert.alert('Error', error.message); return }
    setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, seller_reply: replyText.trim() } : r))
    setReplyingTo(null)
    setReplyText('')
  }

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '—'

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Reviews</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <Text style={styles.avgRating}>{avgRating}</Text>
        <Text style={styles.avgStar}>⭐</Text>
        <Text style={styles.totalReviews}>{reviews.length} review{reviews.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Reply modal */}
      {replyingTo && (
        <View style={styles.replyModal}>
          <TextInput
            style={styles.replyInput}
            placeholder="Write your reply..."
            placeholderTextColor={colors.textMuted}
            value={replyText}
            onChangeText={setReplyText}
            multiline
            maxLength={300}
            autoFocus
          />
          <View style={styles.replyActions}>
            <TouchableOpacity onPress={() => { setReplyingTo(null); setReplyText('') }}>
              <Text style={styles.replyCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.replySubmit, submitting && { opacity: 0.6 }]}
              onPress={() => submitReply(replyingTo)}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={styles.replySubmitText}>Post Reply</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : reviews.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No reviews yet</Text>
          <Text style={styles.emptySub}>Reviews appear after buyers rate their orders</Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={r => r.id}
          renderItem={({ item }) => (
            <ReviewCard review={item} onReply={(id) => { setReplyingTo(id); setReplyText('') }} />
          )}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
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
  summary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avgRating: { fontSize: 36, fontWeight: '800', color: colors.textPrimary },
  avgStar: { fontSize: 28 },
  totalReviews: { fontSize: 14, color: colors.textMuted },
  replyModal: {
    margin: spacing.md, padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.primary,
  },
  replyInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: 14, color: colors.textPrimary,
    minHeight: 72, textAlignVertical: 'top', marginBottom: spacing.sm,
  },
  replyActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  replyCancel: { fontSize: 15, color: colors.textSecondary, paddingVertical: 8, paddingHorizontal: spacing.sm },
  replySubmit: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, height: 38, alignItems: 'center', justifyContent: 'center',
  },
  replySubmitText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  avatarCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  reviewerName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  reviewDate: { fontSize: 12, color: colors.textMuted },
  reviewText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20, marginBottom: spacing.sm },
  replyBox: {
    backgroundColor: '#FFF8F5', borderRadius: radius.sm, padding: spacing.sm,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  replyLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 2 },
  replyText: { fontSize: 13, color: colors.textSecondary },
  replyBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  replyBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
})
