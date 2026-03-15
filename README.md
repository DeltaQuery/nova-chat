# Nova Chat

Widget de chat embebible para cualquier sitio web. Conecta con un webhook de n8n y soporta respuestas en tiempo real (streaming). Construido con Preact — menos de 50kb en total.

---

## Instalación

Agrega este bloque de código en cualquier página HTML, antes del cierre de `</body>`:

```html
<div id="nova-chat"></div>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/DeltaQuery/marateca-chat@1.0.0/dist/nova-chat.css">
<script src="https://cdn.jsdelivr.net/gh/DeltaQuery/marateca-chat@1.0.0/dist/nova-chat.iife.js"></script>
<script>
  NovaChat.createChat({
    webhookUrl: 'https://tu-n8n.com/webhook/tu-id/chat',
  })
</script>
```

---

## Configuración

Todas las opciones son opcionales excepto `webhookUrl`.

```js
NovaChat.createChat({

  // ── Requerido ────────────────────────────────────────────────────
  webhookUrl: 'https://tu-n8n.com/webhook/tu-id/chat',

  // ── Apariencia ───────────────────────────────────────────────────
  theme:   'blue',    // 'green' | 'blue' | 'dark' | 'silver'  (default: 'green')
  avatar:  'https://tu-web.com/logo.png',   // URL del logo en el header (opcional)
  fabIcon: 'https://tu-web.com/icono.png',  // URL del ícono del botón flotante (opcional)

  // ── Comportamiento ───────────────────────────────────────────────
  defaultLanguage:     'es',    // 'es' | 'en'  (default: 'es')
  showWelcomeScreen:   false,   // true = pantalla de bienvenida antes del chat
  loadPreviousSession: true,    // true = recuerda los últimos 8 mensajes por 24h
  enableStreaming:     false,   // true = texto aparece letra por letra

  // ── Mensajes iniciales ───────────────────────────────────────────
  initialMessages: [
    '¡Hola! ¿En qué puedo ayudarte hoy?'
  ],

  // ── Textos de la interfaz ────────────────────────────────────────
  i18n: {
    es: {
      title:            'Asistente virtual',
      inputPlaceholder: 'Escribe tu consulta...',
      welcomeButton:    'Iniciar conversación',
      welcomeSubtitle:  'Estamos aquí para ayudarte 24/7.',
      online:           'En línea',
      today:            'Hoy',
    },
    en: {
      title:            'Virtual assistant',
      inputPlaceholder: 'Type a message...',
      welcomeButton:    'Start conversation',
      welcomeSubtitle:  'We are here to help you 24/7.',
      online:           'Online',
      today:            'Today',
    }
  }
})
```

---

## Temas

| Valor | Color principal |
|-------|----------------|
| `green` | #00C48C |
| `blue` | #0084FF |
| `dark` | #1F2C34|
| `silver` | #8696A0 |

---

## Compatibilidad con n8n

El widget envía los mensajes en el formato estándar del chat de n8n:

```json
{
  "action": "sendMessage",
  "sessionId": "uuid-del-usuario",
  "chatInput": "mensaje del usuario",
  "metadata": {}
}
```

### Modo normal
Configura el nodo **"When chat message received"** con **Response Mode: Last Node**. El widget espera un JSON con alguno de estos campos: `output`, `message`, o `text`.

### Modo streaming
Configura el nodo con **Response Mode: Streaming**. Activa `enableStreaming: true` en el widget.

---

## Sesión y historial

- El `sessionId` se genera automáticamente y se guarda en `localStorage` — persiste entre pestañas y visitas del mismo navegador.
- Con `loadPreviousSession: true`, el widget recuerda los últimos 8 mensajes durante 24 horas.
- Después de 24 horas sin actividad, el historial se borra automáticamente.

---

## Desarrollo local

```bash
git clone https://github.com/DeltaQuery/marateca-chat.git
cd marateca-chat
npm install
npm run dev
```

Para compilar y publicar:

```bash
npm run build
git add .
git commit -m "descripción del cambio"
git push origin main
```

Para publicar una nueva versión estable:

```bash
git tag v1.x.x
git push origin v1.x.x
```

---

## Stack

- [Preact](https://preactjs.com/) — UI (~3kb)
- [Vite](https://vitejs.dev/) — build en modo librería
- [GitHub Pages](https://pages.github.com/) — hosting del demo
- [jsDelivr](https://www.jsdelivr.com/) — CDN para producción