/**
 * GstPincodeModal
 *
 * Shown before the first add-to-cart on a store that lacks admin-verified GST.
 * The buyer enters their delivery pincode; we resolve it to a state and compare
 * against the store's state. If they differ the buyer is blocked with a friendly
 * message. On success the parent is notified so it can proceed with the add.
 */

import React, { useState } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Dimensions,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { colors, radius, spacing } from '../constants/theme'
import { stateForPincode } from '../lib/pincode-state'
import { fireInterstateDemand, markPincodeCleared } from '../lib/interstateGst'

const { height: SCREEN_H } = Dimensions.get('window')

interface Props {
  visible: boolean
  storeId: string
  /** Full state name from stores.state — e.g. "Karnataka" */
  storeState: string
  onSuccess: (buyerPincode: string) => void
  onClose: () => void
}

export default function GstPincodeModal({
  visible, storeId, storeState, onSuccess, onClose,
}: Props) {
  const [pincode, setPincode] = useState('')
  const [checking, setChecking] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function reset() {
    setPincode('')
    setChecking(false)
    setErrorMsg(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleCheck() {
    const pin = pincode.trim()
    if (!/^\d{6}$/.test(pin)) {
      setErrorMsg('Please enter a valid 6-digit pincode.')
      return
    }
    setChecking(true)
    setErrorMsg(null)

    const buyerState = stateForPincode(pin)

    // Unknown pincode — let them through (DB trigger is the authoritative backstop).
    if (!buyerState) {
      markPincodeCleared(storeId)
      reset()
      onSuccess(pin)
      return
    }

    const sameState =
      buyerState.trim().toLowerCase() === storeState.trim().toLowerCase()

    if (!sameState) {
      // Interstate block
      setChecking(false)
      setErrorMsg(
        `This seller delivers only within ${storeState}. Not available for your location (${buyerState}).`
      )
      // Fire demand signal — fire-and-forget, deduped.
      fireInterstateDemand(storeId, buyerState)
      return
    }

    // Same state — clear and proceed.
    markPincodeCleared(storeId)
    setChecking(false)
    reset()
    onSuccess(pin)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Enter Delivery Pincode</Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Info banner */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoIcon}>ⓘ</Text>
            <Text style={styles.infoText}>
              This seller ships only within {storeState}. Confirm your pincode to continue.
            </Text>
          </View>

          {/* Pincode input */}
          <Text style={styles.label}>Your delivery pincode</Text>
          <TextInput
            style={[styles.input, errorMsg !== null && !checking && styles.inputError]}
            value={pincode}
            onChangeText={v => {
              setPincode(v.replace(/\D/g, '').slice(0, 6))
              if (errorMsg) setErrorMsg(null)
            }}
            placeholder="6-digit pincode"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCheck}
          />

          {/* Error / block message */}
          {errorMsg && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* CTA */}
          <TouchableOpacity
            style={[styles.btn, (checking || pincode.length < 6) && styles.btnDisabled]}
            onPress={handleCheck}
            disabled={checking || pincode.length < 6}
            activeOpacity={0.85}
          >
            {checking
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.btnText}>Check availability</Text>
            }
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
    paddingTop: spacing.md,
    maxHeight: SCREEN_H * 0.65,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  closeBtn: { fontSize: 18, color: colors.textMuted, fontWeight: '600' },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF8EE',
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  infoIcon: { fontSize: 16, color: colors.primary },
  infoText: { flex: 1, fontSize: 13, color: colors.primary, lineHeight: 20 },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    height: 48,
    fontSize: 18,
    color: colors.textPrimary,
    letterSpacing: 4,
    marginBottom: spacing.sm,
  },
  inputError: {
    borderColor: colors.error,
  },

  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 13,
    color: colors.error,
    lineHeight: 20,
    fontWeight: '500',
  },

  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 15 },

  cancelBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
})
