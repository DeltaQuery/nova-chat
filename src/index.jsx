import { render, h } from 'preact'
import { useState } from 'preact/hooks'
import { Chat } from './Chat.jsx'

// Temas de color
const THEMES = {
  green: {
    '--brand':       '#00C48C',
    '--brand-dark':  '#009E72',
    '--bubble-user': '#DCF8C6',
  },
  blue: {
    '--brand':       '#0084FF',
    '--brand-dark':  '#006ACC',
    '--bubble-user': '#CCE5FF',
  },
  dark: {
    '--brand':       '#1F2C34',
    '--brand-dark':  '#111B21',
    '--bubble-user': '#2A3942',
  },
  silver: {
    '--brand':       '#8696A0',
    '--brand-dark':  '#667781',
    '--bubble-user': '#E9EDEF',
  },
}

function Widget({ config }) {
  const [open, setOpen] = useState(false)

  // Aplicar tema como variables CSS en el contenedor raíz
  const theme = THEMES[config.theme] || THEMES.green
  const themeStyle = Object.entries(theme)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')

  return (
    <>
      {/* Botón FAB — visible en móvil Y desktop, coloreado por tema */}
      {!open && (
        <button
          class="mc-fab"
          style={themeStyle}
          onClick={() => setOpen(true)}
          aria-label="Abrir chat"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
        </button>
      )}

      {/* Backdrop — solo desktop */}
      {open && <div class="mc-backdrop open" onClick={() => setOpen(false)} />}

      {/* Ventana de chat */}
      {open && (
        <Chat
          config={config}
          theme={themeStyle}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

export function createChat(config) {
  // Defaults
  const finalConfig = {
    theme: 'green',
    defaultLanguage: 'en',
    showWelcomeScreen: false,
    loadPreviousSession: true,
    enableStreaming: false,
    initialMessages: [],
    i18n: {
      en: {
        title: 'Asistente virtual',
        inputPlaceholder: 'Escribe un mensaje...',
      }
    },
    ...config,
    // Merge profundo de i18n para no perder defaults
    i18n: {
      en: {
        title: 'Asistente virtual',
        inputPlaceholder: 'Escribe un mensaje...',
        ...(config.i18n?.en || {}),
      }
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