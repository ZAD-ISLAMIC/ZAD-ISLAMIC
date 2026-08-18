import React from 'react'
import { Icon } from '../ui/Icon.jsx'

/**
 * Confirm dialog for destructive/irreversible actions.
 * Mirrors the app's bottom-sheet pattern (loc-sheet/set-sheet).
 */
export function SettingsConfirm({ title, message, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', danger = true, onConfirm, onClose }) {
  return (
    <div className="settings-confirm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="settings-confirm__backdrop" onClick={onClose} />
      <div className="settings-confirm__card">
        <div className="settings-confirm__icon" aria-hidden="true">
          <Icon name={danger ? 'alert' : 'info'} size={22} />
        </div>
        <h3 className="settings-confirm__title">{title}</h3>
        {message && <p className="settings-confirm__msg">{message}</p>}
        <div className="settings-confirm__actions">
          <button className="settings-confirm__btn settings-confirm__btn--ghost" onClick={onClose} type="button">
            {cancelLabel}
          </button>
          <button
            className={`settings-confirm__btn${danger ? ' settings-confirm__btn--danger' : ' settings-confirm__btn--primary'}`}
            onClick={() => {
              onConfirm()
              onClose()
            }}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
