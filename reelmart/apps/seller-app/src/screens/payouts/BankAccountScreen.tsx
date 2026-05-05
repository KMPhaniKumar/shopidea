import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useSellerStore } from '../../store/sellerStore'
import { getBankAccount, saveBankAccount, BankAccount } from '../../services/payoutService'

type Props = { navigation: NativeStackNavigationProp<any> }

function Field({ label, value, onChange, placeholder, keyboardType, maxLength, secureTextEntry, editable }: any) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, editable === false && styles.fieldInputDisabled]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        maxLength={maxLength}
        secureTextEntry={secureTextEntry}
        editable={editable !== false}
        autoCapitalize="characters"
      />
    </View>
  )
}

export default function BankAccountScreen({ navigation }: Props) {
  const store = useSellerStore(s => s.store)
  const [existing, setExisting] = useState<BankAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  const [holderName, setHolderName] = useState('')
  const [accountNum, setAccountNum] = useState('')
  const [confirmNum, setConfirmNum] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [bankName, setBankName] = useState('')

  useEffect(() => {
    if (!store) return
    getBankAccount(store.seller_id).then(b => {
      setExisting(b)
      if (b) {
        setHolderName(b.account_holder)
        setAccountNum(b.account_number)
        setConfirmNum(b.account_number)
        setIfsc(b.ifsc_code)
        setBankName(b.bank_name ?? '')
      } else {
        setEditing(true)
      }
      setLoading(false)
    })
  }, [store?.seller_id])

  async function handleSave() {
    if (!store) return
    if (!holderName.trim() || !accountNum.trim() || !ifsc.trim() || !bankName.trim()) {
      Alert.alert('Missing fields', 'Please fill all required fields')
      return
    }
    setSaving(true)
    try {
      await saveBankAccount(store.seller_id, {
        accountHolderName: holderName,
        accountNumber: accountNum,
        confirmAccountNumber: confirmNum,
        ifscCode: ifsc,
        bankName,
      })
      const updated = await getBankAccount(store.seller_id)
      setExisting(updated)
      setEditing(false)
      Alert.alert('Saved!', 'Bank account details saved. Verification may take 1–2 business days.')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const maskedAccount = existing
    ? `•••• •••• ${existing.account_number.slice(-4)}`
    : ''

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Bank Account</Text>
        {existing && !editing ? (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.editBtn}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoTitle}>🏦 Payout Setup</Text>
          <Text style={styles.infoText}>
            Payouts are processed every Monday. Platform fee: 2% per order.
            {'\n'}Amount settles in your bank within 2 business days.
          </Text>
        </View>

        {existing && !editing ? (
          /* Read-only view */
          <View style={styles.savedCard}>
            <View style={[styles.verifiedBadge, !existing.is_verified && styles.pendingBadge]}>
              <Text style={[styles.verifiedText, !existing.is_verified && styles.pendingText]}>
                {existing.is_verified ? '✓ Verified' : '⏳ Verification pending'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Account Holder</Text>
              <Text style={styles.detailValue}>{existing.account_holder}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Account Number</Text>
              <Text style={styles.detailValue}>{maskedAccount}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>IFSC Code</Text>
              <Text style={styles.detailValue}>{existing.ifsc_code}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bank</Text>
              <Text style={styles.detailValue}>{existing.bank_name}</Text>
            </View>
          </View>
        ) : (
          /* Edit form */
          <View style={styles.form}>
            <Field
              label="Account Holder Name *"
              value={holderName}
              onChange={setHolderName}
              placeholder="As per bank records"
              autoCapitalize="words"
            />
            <Field
              label="Account Number *"
              value={accountNum}
              onChange={setAccountNum}
              placeholder="Enter account number"
              keyboardType="number-pad"
              maxLength={18}
            />
            <Field
              label="Confirm Account Number *"
              value={confirmNum}
              onChange={setConfirmNum}
              placeholder="Re-enter account number"
              keyboardType="number-pad"
              maxLength={18}
              secureTextEntry
            />
            <Field
              label="IFSC Code *"
              value={ifsc}
              onChange={(v: string) => setIfsc(v.toUpperCase())}
              placeholder="e.g. SBIN0001234"
              maxLength={11}
            />
            <Field
              label="Bank Name *"
              value={bankName}
              onChange={setBankName}
              placeholder="e.g. State Bank of India"
            />

            <Text style={styles.hint}>
              ⚠️ Ensure account details are correct. Wrong details may cause payout failure.
            </Text>

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.saveBtnText}>Save Bank Account</Text>
              }
            </TouchableOpacity>

            {editing && existing && (
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
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
  editBtn: { fontSize: 15, color: colors.primary, fontWeight: '700' },
  body: { padding: spacing.lg, paddingBottom: 40 },
  infoBanner: {
    backgroundColor: '#EFF6FF', borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  infoTitle: { fontSize: 15, fontWeight: '700', color: '#1D4ED8', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#3B82F6', lineHeight: 20 },
  savedCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  verifiedBadge: {
    alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill, backgroundColor: '#DCFCE7', marginBottom: spacing.md,
  },
  pendingBadge: { backgroundColor: '#FFF8E7' },
  verifiedText: { fontSize: 13, fontWeight: '700', color: colors.success },
  pendingText: { color: '#F59E0B' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { fontSize: 13, color: colors.textMuted },
  detailValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  form: {},
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  fieldInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, height: 48, fontSize: 15, color: colors.textPrimary,
  },
  fieldInputDisabled: { backgroundColor: colors.surface, color: colors.textMuted },
  hint: { fontSize: 13, color: '#F59E0B', marginBottom: spacing.lg, lineHeight: 20 },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  cancelBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 15, color: colors.textSecondary },
})
