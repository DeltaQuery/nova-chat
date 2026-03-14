import { useState, useEffect, useRef } from 'preact/hooks'
import './chat.css'

const STORAGE_KEY = 'mc_session'
const HISTORY_KEY = 'mc_history'
const MAX_MESSAGES = 8
const TTL_MS = 24 * 60 * 60 * 1000
const TYPING_SPEED = 8   // ms por carácter — ajusta este valor

function getTime() {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

/* ── MARKDOWN PARSER ──────────────────────────────────────────────────────── */
function parseMarkdown(text) {
  if (!text) return null
  const normalized = text.replace(/\\n/g, '\n')
  const lines = normalized.split('\n')
  const result = []

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) result.push(<br key={`br-${lineIndex}`} />)

    const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
    let last = 0, match, i = 0

    while ((match = regex.exec(line)) !== null) {
      if (match.index > last) result.push(line.slice(last, match.index))
      if (match[1] !== undefined) {
        result.push(<strong key={`b-${lineIndex}-${i++}`}>{match[1]}</strong>)
      } else {
        result.push(
          <a key={`a-${lineIndex}-${i++}`} href={match[3]} target="_blank" rel="noopener noreferrer" class="mc-link">
            {match[2]}
          </a>
        )
      }
      last = match.index + match[0].length
    }
    if (last < line.length) result.push(line.slice(last))
  })

  return result
}

/* ── NDJSON PARSER ──────────────────────────────────────────────────────── */
function extractJsonChunks(buffer) {
  const chunks = []
  let pos = 0

  while (pos < buffer.length) {
    const open = buffer.indexOf('{', pos)
    if (open === -1) break

    let depth = 0, end = -1
    for (let i = open; i < buffer.length; i++) {
      if (buffer[i] === '{') depth++
      if (buffer[i] === '}') depth--
      if (depth === 0) { end = i; break }
    }

    if (end === -1) break

    try { chunks.push(JSON.parse(buffer.slice(open, end + 1))) } catch { }
    pos = end + 1
  }

  const remaining = pos < buffer.length
    ? buffer.slice(buffer.lastIndexOf('{', buffer.length) > pos - 1
      ? buffer.lastIndexOf('{', buffer.length)
      : pos)
    : ''
  return { chunks, remaining }
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
  } catch { return [] }
}

function saveHistory(messages) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({
      messages: messages.slice(-MAX_MESSAGES),
      lastAt: Date.now()
    }))
  } catch { }
}

/* ── COMPONENTE ─────────────────────────────────────────────────────────── */
export function Chat({ config, theme, onClose, onPending }) {
  const {
    webhookUrl,
    initialMessages = [],
    i18n = {},
    defaultLanguage = 'es',
    showWelcomeScreen = false,
    loadPreviousSession = true,
    enableStreaming = false,
    avatar = null,
  } = config

  const t = i18n[defaultLanguage] || i18n.es || i18n.en || {}
  const sessionId = useRef(getSessionId())

  const [messages, setMessages] = useState(() => {
    if (loadPreviousSession) {
      const history = loadHistory()
      if (history.length > 0) return history
    }
    return initialMessages.map(text => ({
      id: Date.now() + Math.random(), text, role: 'bot', time: getTime()
    }))
  })

  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [closing, setClosing] = useState(false)
  const [started, setStarted] = useState(!showWelcomeScreen)

  const pendingRef = useRef(false)
  const onPendingRef = useRef(onPending)
  useEffect(() => { onPendingRef.current = onPending }, [onPending])
  const messagesRef = useRef(null)
  const inputRef = useRef(null)

  // Cola de caracteres pendientes de mostrar
  const charQueueRef = useRef([])
  // Texto ya mostrado en pantalla para la burbuja actual
  const displayedRef = useRef('')
  // ID del intervalo de escritura
  const typingTimerRef = useRef(null)
  // ID del mensaje bot activo en streaming
  const streamBotIdRef = useRef(null)

  useEffect(() => { return () => { pendingRef.current = true } }, [])

  useEffect(() => {
    const raw = sessionStorage.getItem('mc_pending')
    if (!raw) return
    sessionStorage.removeItem('mc_pending')
    try {
      const pending = JSON.parse(raw)
      setMessages(prev => prev.some(m => m.id === pending.id) ? prev : [...prev, pending])
    } catch { }
  }, [])

  useEffect(() => {
    if (loadPreviousSession && messages.length > 0) saveHistory(messages)
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

  /* ── MOTOR DE ESCRITURA ───────────────────────────────────────────────── */
  function startTypingTimer(botId) {
    if (typingTimerRef.current) return  // ya está corriendo

    typingTimerRef.current = setInterval(() => {
      if (charQueueRef.current.length === 0) return

      // Sacar un carácter de la cola
      const char = charQueueRef.current.shift()
      displayedRef.current += char

      const displayed = displayedRef.current
      setMessages(prev => prev.map(m =>
        m.id === botId ? { ...m, text: displayed } : m
      ))
      scrollBottom()
    }, TYPING_SPEED)
  }

  function stopTypingTimer() {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current)
      typingTimerRef.current = null
    }
  }

  // Esperar a que la cola se vacíe completamente
  function waitQueueEmpty() {
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (charQueueRef.current.length === 0) {
          clearInterval(check)
          resolve()
        }
      }, 20)
    })
  }

  function handleClose() {
    setClosing(true)
    setTimeout(onClose, 200)
  }

  function addMessage(text, role) {
    const msg = { id: Date.now() + Math.random(), text, role, time: getTime() }
    setMessages(prev => [...prev, msg])
    return msg
  }

  /* ── MODO NORMAL ──────────────────────────────────────────────────────── */
  async function sendNormal(text) {
    setTyping(true)
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sendMessage', sessionId: sessionId.current,
          chatInput: text, metadata: {}
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const reply = data?.output ?? data?.message ?? data?.text ?? '(Sin respuesta)'
      const botMsg = { id: Date.now() + Math.random(), text: reply, role: 'bot', time: getTime() }

      if (!pendingRef.current) {
        setMessages(prev => [...prev, botMsg])
      } else {
        const current = loadHistory()
        saveHistory([...current, botMsg])
        sessionStorage.setItem('mc_pending', JSON.stringify(botMsg))
        if (onPendingRef.current) onPendingRef.current()
      }
    } catch (err) {
      if (!pendingRef.current)
        addMessage('⚠️ No pude conectar con el servidor. Intenta de nuevo.', 'bot')
      console.error('[Marateca Chat]', err)
    } finally {
      if (!pendingRef.current) setTyping(false)
    }
  }

  /* ── MODO STREAMING ───────────────────────────────────────────────────── */
  async function sendStreaming(text) {
    if (pendingRef.current) return

    setTyping(true)

    const botId = Date.now() + Math.random()
    const botTime = getTime()
    let botCreated = false
    let hasChunks = false

    // Resetear cola y estado de escritura
    charQueueRef.current = []
    displayedRef.current = ''
    streamBotIdRef.current = botId

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sendMessage', sessionId: sessionId.current,
          chatInput: text, metadata: {}
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!res.body) throw new Error('Response body no disponible')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (pendingRef.current) { reader.cancel(); break }

        buffer += decoder.decode(value, { stream: true })
        const { chunks, remaining } = extractJsonChunks(buffer)
        buffer = remaining

        for (const chunk of chunks) {
          switch (chunk.type) {

            case 'item': {
              if (!chunk.content) break
              hasChunks = true

              if (!botCreated) {
                // Primer chunk: ocultar puntos, crear burbuja vacía
                setTyping(false)
                setMessages(prev => [...prev, {
                  id: botId, text: '', role: 'bot', time: botTime
                }])
                botCreated = true
                startTypingTimer(botId)
              }

              // Meter cada carácter del chunk en la cola
              for (const char of chunk.content) {
                charQueueRef.current.push(char)
              }
              break
            }

            case 'error': {
              hasChunks = true
              const errText = `⚠️ Error del servidor: ${chunk.content ?? 'desconocido'}`
              if (!botCreated) {
                setTyping(false)
                setMessages(prev => [...prev, {
                  id: botId, text: errText, role: 'bot', time: botTime
                }])
                botCreated = true
              }
              break
            }
          }
        }
      }

      // Esperar a que todos los caracteres de la cola se muestren
      if (botCreated) {
        await waitQueueEmpty()
      }

      stopTypingTimer()

      if (!hasChunks && !pendingRef.current) {
        setTyping(false)
        addMessage('⚠️ No pude conectar con el servidor. Intenta de nuevo.', 'bot')
      }

    } catch (err) {
      stopTypingTimer()
      if (!pendingRef.current && !botCreated) {
        setTyping(false)
        addMessage('⚠️ No pude conectar con el servidor. Intenta de nuevo.', 'bot')
      }
      console.error('[Marateca Chat]', err)
    }
  }

  /* ── SUBMIT ───────────────────────────────────────────────────────────── */
  function handleSubmit(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    addMessage(text, 'user')
    enableStreaming ? sendStreaming(text) : sendNormal(text)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  /* ── RENDER ───────────────────────────────────────────────────────────── */
  return (
    <div class={`mc-window ${closing ? 'mc-closing' : ''}`} style={theme}>

      <header class="mc-header">
        <div class="mc-header-info">
          <div class={`mc-avatar${config.avatar ? ' mc-avatar--custom' : ''}`}>
            {config.avatar
              ? <img src={config.avatar} alt="avatar" />
              : '🏃'}
          </div>
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
          <p>{t.welcomeSubtitle || 'Estamos aquí para ayudarte 24/7.'}</p>
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
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </form>
        </>
      )}

    </div>
  )
}