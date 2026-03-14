import { render, h } from 'preact'
import { useState } from 'preact/hooks'
import { Chat } from './Chat.jsx'

const THEMES = {
  green: {
    '--brand': '#00C48C',
    '--brand-dark': '#009E72',
    '--bubble-user': '#DCF8C6',
  },
  blue: {
    '--brand': '#0084FF',
    '--brand-dark': '#006ACC',
    '--bubble-user': '#CCE5FF',
  },
  dark: {
    '--brand': '#1F2C34',
    '--brand-dark': '#111B21',
    '--bubble-user': '#2A3942',
  },
  silver: {
    '--brand': '#8696A0',
    '--brand-dark': '#667781',
    '--bubble-user': '#E9EDEF',
  },
}

const DEFAULT_I18N = {
  en: {
    title: 'Virtual assistant',
    inputPlaceholder: 'Type a message...',
    welcomeButton: 'Start conversation',
    online: 'Online',
    today: 'Today',
    welcomeSubtitle:  'We are here to help you 24/7.',
  },
  es: {
    title: 'Asistente virtual',
    inputPlaceholder: 'Escribe un mensaje...',
    welcomeButton: 'Iniciar conversación',
    online: 'En línea',
    today: 'Hoy',
    welcomeSubtitle:  'Estamos aquí para ayudarte 24/7.',
  },
}

function Widget({ config }) {
  const [open, setOpen] = useState(false)
  const [badge, setBadge] = useState(false)

  const theme = THEMES[config.theme] || THEMES.green
  const themeStyle = Object.entries(theme)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')

  function handleOpen() {
    setBadge(false)
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
  }

  // Llamado desde Chat cuando llega respuesta con el chat cerrado
  function handlePending() {
    setBadge(true)
  }

  return (
    <>
      {!open && (
        <button
          class="mc-fab"
          style={themeStyle}
          onClick={handleOpen}
          aria-label="Abrir chat"
        >
          {config.fabIcon
            ? <img src={config.fabIcon} alt="" class="mc-fab-icon" />
            : <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
          }
          {badge && <span class="mc-fab-badge" />}
        </button>

      )}

      {open && <div class="mc-backdrop open" onClick={handleClose} />}

      {open && (
        <Chat
          config={config}
          theme={themeStyle}
          onClose={handleClose}
          onPending={handlePending}
        />
      )}
    </>
  )
}

export function createChat(userConfig) {
  const lang = userConfig.defaultLanguage || 'es'

  const defaultTexts = DEFAULT_I18N[lang] || DEFAULT_I18N.es
  const userTexts = userConfig.i18n?.[lang] || {}
  const mergedTexts = { ...defaultTexts, ...userTexts }

  const finalConfig = {
    theme: 'green',
    defaultLanguage: 'es',
    showWelcomeScreen: false,
    loadPreviousSession: true,
    enableStreaming: false,
    initialMessages: [],
    ...userConfig,
    i18n: {
      ...userConfig.i18n,
      [lang]: mergedTexts,
    }
  }

  const targetSelector = finalConfig.target || '#marateca-chat'
  let container = document.querySelector(targetSelector)

  if (!container) {
    container = document.createElement('div')
    container.id = 'marateca-chat-root'
    document.body.appendChild(container)
  } else {
    container.id = 'marateca-chat-root'
  }

  render(h(Widget, { config: finalConfig }), container)
}