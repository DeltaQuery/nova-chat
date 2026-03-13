import { useState, useEffect, useRef } from 'preact/hooks'
import './chat.css'

const STORAGE_KEY   = 'mc_session'
const HISTORY_KEY   = 'mc_history'
const MAX_MESSAGES  = 8      // máximo de mensajes guardados (4 user + 4 bot)
const TTL_MS        = 24 * 60 * 60 * 1000  // 24 horas en ms

function getTime() {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

/* ── SESIÓN ─────────────────────────────────────────────────────────────────
   Obtiene o crea un sessionId persistente en localStorage.
   El mismo ID se usa en todas las pestañas del mismo navegador.
────────────────────────────────────────────────────────────────────────── */
function getSessionId() {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}

/* ── HISTORIAL ──────────────────────────────────────────────────────────────
   Guarda y recupera los últimos MAX_MESSAGES mensajes.
   Si han pasado más de 24h desde el último mensaje, se borra el historial.
────────────────────────────────────────────────────────────────────────── */
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const { messages, lastAt } = JSON.parse(raw)
    // Si pasaron más de 24h, historial expirado
    if (Date.now() - lastAt > TTL_MS) {
      localStorage.removeItem(HISTORY_KEY)
      return []
    }
    return messages || []
  } catch {
    return []
  }
}

function saveHistory(messages) {
  try {
    // Guarda solo los últimos MAX_MESSAGES mensajes
    const trimmed = messages.slice(-MAX_MESSAGES)
    localStorage.setItem(HISTORY_KEY, JSON.stringify({
      messages: trimmed,
      lastAt: Date.now()
    }))
  } catch {}
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY)
  localStorage.removeItem(STORAGE_KEY)
}

/* ── COMPONENTE ─────────────────────────────────────────────────────────── */
export function Chat({ config, theme, onClose }) {
  const {
    webhookUrl,
    initialMessages      = [],
    i18n                 = {},
    defaultLanguage      = 'es',
    showWelcomeScreen    = false,
    loadPreviousSession  = true,
  } = config

  const t         = i18n[defaultLanguage] || i18n.es || i18n.en || {}
  const sessionId = useRef(getSessionId())

  // Inicializar mensajes: historial guardado o mensajes iniciales
  const [messages, setMessages] = useState(() => {
    if (loadPreviousSession) {
      const history = loadHistory()
      if (history.length > 0) return history
    }
    return initialMessages.map(text => ({
      id:   Date.now() + Math.random(),
      text,
      role: 'bot',
      time: getTime()
    }))
  })

  const [input,   setInput]   = useState('')
  const [typing,  setTyping]  = useState(false)
  const [closing, setClosing] = useState(false)
  const [started, setStarted] = useState(!showWelcomeScreen)
  const messagesRef            = useRef(null)
  const inputRef               = useRef(null)

  // Guardar historial cada vez que cambian los mensajes
  useEffect(() => {
    if (loadPreviousSession && messages.length > 0) {
      saveHistory(messages)
    }
  }, [messages])

  function scrollBottom() {
    requestAnimationFrame(() => {
      if (messagesRef.current)
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    })
  }

  useEffect(() => { scrollBottom() }, [messages, typing])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const handler = () => scrollBottom()
    vv.addEventListener('resize', handler, { passive: true })
    return () => vv.removeEventListener('resize', handler)
  }, [])

  function handleClose() {
    setClosing(true)
    setTimeout(onClose, 200)
  }

  function addMessage(text, role) {
    setMessages(prev => [...prev, {
      id:   Date.now() + Math.random(),
      text,
      role,
      time: getTime()
    }])
  }

  async function sendMessage(text) {
    setTyping(true)
    try {
      const res = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:    'sendMessage',
          sessionId: sessionId.current,
          chatInput: text,
          metadata:  {}
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data  = await res.json()
      const reply = data?.output ?? data?.message ?? data?.text ?? '(Sin respuesta)'
      addMessage(reply, 'bot')
    } catch (err) {
      addMessage('⚠️ No pude conectar con el servidor. Intenta de nuevo.', 'bot')
      console.error('[Marateca Chat]', err)
    } finally {
      setTyping(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    addMessage(text, 'user')
    sendMessage(text)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div class={`mc-window ${closing ? 'mc-closing' : ''}`} style={theme}>

      <header class="mc-header">
        <div class="mc-header-info">
          <div class="mc-avatar">🏃</div>
          <div class="mc-header-text">
            <h3>{t.title || 'Asistente virtual'}</h3>
            <span><span class="mc-status-dot" />{t.online || 'En línea'}</span>
          </div>
        </div>
        <button class="mc-close-btn" onClick={handleClose} aria-label="Cerrar">✕</button>
      </header>

      {!started ? (
        <div class="mc-welcome">
          <div class="mc-welcome-icon">🏃</div>
          <h2>{t.title || 'Asistente virtual'}</h2>
          <p>Estamos aquí para ayudarte 24/7.</p>
          <button class="mc-welcome-btn" onClick={() => setStarted(true)}>
            {t.welcomeButton || 'Iniciar conversación'}
          </button>
        </div>
      ) : (
        <>
          <div class="mc-messages" ref={messagesRef}>
            <div class="mc-date-sep">{t.today || 'Hoy'}</div>
            {messages.map(msg => (
              <div key={msg.id} class={`mc-msg ${msg.role}`}>
                {msg.text}
                <span class="mc-msg-time">{msg.time}</span>
              </div>
            ))}
            {typing && (
              <div class="mc-typing">
                <span /><span /><span />
              </div>
            )}
          </div>

          <form class="mc-form" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              class="mc-input"
              type="text"
              value={input}
              onInput={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setTimeout(scrollBottom, 300)}
              placeholder={t.inputPlaceholder || 'Escribe un mensaje...'}
              autocomplete="off"
              autocorrect="off"
              autocapitalize="sentences"
              spellcheck="false"
              enterkeyhint="send"
            />
            <button type="submit" class="mc-send-btn" aria-label="Enviar">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </form>
        </>
      )}

    </div>
  )
}