import React, { useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { TransferForm, TransferFormHandle } from './TransferForm';

const styles = StyleSheet.create({
  footerButton: { flex: 1 },
});

/**
 * Moves money the user already has — cash into an investment, or cash onto
 * a liability paydown. Both sides update atomically (AppStateContext.transferFunds)
 * so the user never has to remember to update a second place by hand.
 *
 * Thin KeyboardSheet wrapper around the extracted TransferForm (Stream D,
 * persistent-host proof-of-pattern) — this file's own public props and
 * behaviour for WealthScreen (and every other standalone caller) are
 * unchanged; TransferForm now also renders embedded, without any Modal,
 * inside AddAnythingSheet's Add Anything → Transfer route.
 */
export function TransferModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const formRef = useRef<TransferFormHandle>(null);
  const [canSave, setCanSave] = useState(false);

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title="Move money"
      footer={
        <>
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => formRef.current?.requestClose('cancel')}
            style={styles.footerButton}
          />
          <Button label="Transfer" onPress={() => formRef.current?.requestSave()} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      {visible ? (
        <TransferForm ref={formRef} onCanSaveChange={setCanSave} onSaveSuccess={onClose} onConfirmedClose={onClose} />
      ) : null}
    </KeyboardSheet>
  );
}
