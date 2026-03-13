import { useState, useEffect, useRef } from 'preact/hooks'
import './chat.css'

const STORAGE_KEY  = 'mc_session'
const HISTORY_KEY  = 'mc_history'
const MAX_MESSAGES = 8
const TTL_MS       = 24 * 60 * 60 * 1000

function getTime() {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

/* ── MARKDOWN PARSER ────────────────────────────────────────────────────────
   Maneja en este orden:
   1. Saltos de línea reales y literales \n  → <br>
   2. **texto**                              → <strong>
   3. [texto](url)                           → <a target="_blank">
────────────────────────────────────────────────────────────────────────── */
function parseMarkdown(text) {
  if (!text) return null

  // Paso 1: normalizar saltos de línea literales \n a reales
  const normalized = text.replace(/\\n/g, '\n')

  // Paso 2: dividir por saltos de línea reales
  const lines = normalized.split('\n')

  const result = []

  lines.forEach((line, lineIndex) => {
    // Separador entre líneas
    if (lineIndex > 0) result.push(<br key={`br-${lineIndex}`} />)

    // Paso 3: parsear negritas y links dentro de cada línea
    const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
    let last  = 0
    let match
    let i     = 0

    while ((match = regex.exec(line)) !== null) {
      // Texto plano antes del match
      if (match.index > last) {
        result.push(line.slice(last, match.index))
      }

      if (match[1] !== undefined) {
        // **negrita**
        result.push(<strong key={`b-${lineIndex}-${i++}`}>{match[1]}</strong>)
      } else {
        // [texto](url)
        result.push(
          <a
            key={`a-${lineIndex}-${i++}`}
            href={match[3]}
            target="_blank"
            rel="noopener noreferrer"
            class="mc-link"
          >
            {match[2]}
          </a>
        )
      }
      last = match.index + match[0].length
    }

    // Texto restante
    if (last < line.length) result.push(line.slice(last))
  })

  return result
}

/* ── SESIÓN ─────────────────────────────────────────────────────────────── */
function getSessionId() {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}

/* ── HISTORIAL ──────────────────────────────────────────────────────────── */
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const { messages, lastAt } = JSON.parse(raw)
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
    const trimmed = messages.slice(-MAX_MESSAGES)
    localStorage.setItem(HISTORY_KEY, JSON.stringify({
      messages: trimmed,
      lastAt:   Date.now()
    }))
  } catch {}
}

/* ── COMPONENTE ─────────────────────────────────────────────────────────── */
export function Chat({ config, theme, onClose, onPending }) {
  const {
    webhookUrl,
    initialMessages     = [],
    i18n                = {},
    defaultLanguage     = 'es',
    showWelcomeScreen   = false,
    loadPreviousSession = true,
  } = config

  const t         = i18n[defaultLanguage] || i18n.es || i18n.en || {}
  const sessionId = useRef(getSessionId())

  // ── Estado inicial: historial o mensajes de bienvenida ──────────────────
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

  // pendingRef: true cuando el componente fue desmontado
  const pendingRef  = useRef(false)
  // onPendingRef: referencia estable a onPending para usarla tras desmontar
  const onPendingRef = useRef(onPending)
  useEffect(() => { onPendingRef.current = onPending }, [onPending])

  const messagesRef = useRef(null)
  const inputRef    = useRef(null)

  // Marcar como desmontado al cerrar
  useEffect(() => {
    return () => { pendingRef.current = true }
  }, [])

  // Al montar: cargar mensaje pendiente si existe (llegó con chat cerrado)
  useEffect(() => {
    const raw = sessionStorage.getItem('mc_pending')
    if (!raw) return
    sessionStorage.removeItem('mc_pending')
    try {
      const pending = JSON.parse(raw)
      // Evitar duplicado: solo añadir si no está ya en el historial cargado
      setMessages(prev => {
        const exists = prev.some(m => m.id === pending.id)
        return exists ? prev : [...prev, pending]
      })
    } catch {}
  }, [])

  // Guardar historial en localStorage cuando cambian los mensajes
  // NOTA: este es el ÚNICO lugar donde se guarda. No hay guardado duplicado.
  useEffect(() => {
    if (loadPreviousSession && messages.length > 0) {
      saveHistory(messages)
    }
  }, [messages])

  // ── Scroll ───────────────────────────────────────────────────────────────
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

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleClose() {
    setClosing(true)
    setTimeout(onClose, 200)
  }

  function addMessage(text, role) {
    const msg = { id: Date.now() + Math.random(), text, role, time: getTime() }
    setMessages(prev => [...prev, msg])
    return msg
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
      const botMsg = {
        id:   Date.now() + Math.random(),
        text: reply,
        role: 'bot',
        time: getTime()
      }

      if (!pendingRef.current) {
        // Chat sigue abierto → mostrar normalmente
        // El useEffect de messages se encarga de guardar en localStorage
        setMessages(prev => [...prev, botMsg])
      } else {
        // Chat fue cerrado → guardar en sessionStorage y notificar badge
        // Guardar en localStorage manualmente ya que el useEffect no corre
        const current = loadHistory()
        saveHistory([...current, botMsg])
        sessionStorage.setItem('mc_pending', JSON.stringify(botMsg))
        // Notificar al Widget para mostrar badge en FAB
        if (onPendingRef.current) onPendingRef.current()
      }
    } catch (err) {
      if (!pendingRef.current) {
        addMessage('⚠️ No pude conectar con el servidor. Intenta de nuevo.', 'bot')
      }
      console.error('[Marateca Chat]', err)
    } finally {
      if (!pendingRef.current) setTyping(false)
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

  // ── Render ───────────────────────────────────────────────────────────────
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
                {parseMarkdown(msg.text)}
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