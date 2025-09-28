/**
 * Message formatting utility for AkuAI chat
 * Converts plain text with markdown-like syntax to formatted HTML
 */

/**
 * Format a bot message with proper text styling, lists, and colors
 * @param {string} text - Raw text from the bot
 * @returns {string} - Formatted HTML string
 */
export function formatBotMessage(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Normalize newlines and escape HTML
  let textEsc = text.replace(/\r\n/g, '\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = textEsc.split('\n');
  const out = [];
  let inList = false;
  let listType = null; // 'ul' | 'ol'
  let listSubtype = null; // 'decimal' | 'lower-alpha' | 'upper-alpha'
  let items = [];

  function flushList() {
    if (!inList) return;
    if (listType === 'ul') {
      out.push(`<ul class="bullet-list">${items.map((it) => `<li>${it}</li>`).join('')}</ul>`);
    } else {
      const dtype = listSubtype || 'decimal';
      out.push(`<ol class="numbered-list" data-type="${dtype}">${items.map((it) => `<li>${it}</li>`).join('')}</ol>`);
    }
    inList = false; listType = null; listSubtype = null; items = [];
  }
  function pushP(s) {
    if (!s || !s.trim()) return;
    out.push(`<p class="paragraph">${s}</p>`);
  }

  for (let raw of lines) {
    const line = raw;
    const t = line.trim();
    if (t === '') { flushList(); continue; }

    // Headers
    let m;
    if ((m = t.match(/^###\s+(.+)$/))) { flushList(); out.push(`<h4 class="msg-header-3">${m[1]}</h4>`); continue; }
    if ((m = t.match(/^##\s+(.+)$/)))  { flushList(); out.push(`<h3 class="msg-header-2">${m[1]}</h3>`); continue; }
    if ((m = t.match(/^#\s+(.+)$/)))   { flushList(); out.push(`<h2 class="msg-header-1">${m[1]}</h2>`); continue; }

    // Lettered list: a. text or A) text
    if ((m = t.match(/^([a-zA-Z])[\.)]\s+(.+)$/))) {
      const letter = m[1];
      const content = m[2];
      const subtype = letter === letter.toUpperCase() ? 'upper-alpha' : 'lower-alpha';
      if (!inList || listType !== 'ol' || listSubtype !== subtype) { flushList(); inList = true; listType = 'ol'; listSubtype = subtype; items = []; }
      items.push(content);
      continue;
    }

    // Numbered list: 1. text or 1) text
    if ((m = t.match(/^(\d+)[\.)]\s+(.+)$/))) {
      const content = m[2];
      if (!inList || listType !== 'ol' || listSubtype !== 'decimal') { flushList(); inList = true; listType = 'ol'; listSubtype = 'decimal'; items = []; }
      items.push(content);
      continue;
    }

    // Bullet list: -, *, •
    if ((m = t.match(/^([•\-*])\s+(.+)$/))) {
      const content = m[2];
      if (!inList || listType !== 'ul') { flushList(); inList = true; listType = 'ul'; listSubtype = null; items = []; }
      items.push(content);
      continue;
    }

    // Normal paragraph line
    flushList();
    pushP(t);
  }
  flushList();

  let formatted = out.join('\n');

  // Inline formatting after structure is built
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="bold-text">$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, (match, t) => {
    if (match.includes('**')) return match;
    return `<em class="italic-text">${t}</em>`;
  });
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Highlights
  formatted = formatted.replace(/\[!IMPORTANT\](.*?)\[\/!IMPORTANT\]/gs, '<span class="highlight-red">$1</span>');
  formatted = formatted.replace(/\[!ERROR\](.*?)\[\/!ERROR\]/gs, '<span class="highlight-red">$1</span>');
  formatted = formatted.replace(/\[!WARNING\](.*?)\[\/!WARNING\]/gs, '<span class="highlight-yellow">$1</span>');
  formatted = formatted.replace(/\[!SUCCESS\](.*?)\[\/!SUCCESS\]/gs, '<span class="highlight-green">$1</span>');
  formatted = formatted.replace(/\[!TIP\](.*?)\[\/!TIP\]/gs, '<span class="highlight-green">$1</span>');
  formatted = formatted.replace(/\[!INFO\](.*?)\[\/!INFO\]/gs, '<span class="highlight-blue">$1</span>');
  formatted = formatted.replace(/\[!NOTE\](.*?)\[\/!NOTE\]/gs, '<span class="highlight-blue">$1</span>');

  return formatted;
}

/**
 * Format user messages (simpler formatting)
 * @param {string} text - Raw text from user
 * @returns {string} - Formatted HTML string
 */
export function formatUserMessage(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Simple escaping and line break handling for user messages
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return formatted;
}

/**
 * Format streaming bot message with simpler, real-time formatting
 * @param {string} text - Raw text from the bot (streaming)
 * @returns {string} - Formatted HTML string optimized for streaming
 */
export function formatStreamingBotMessage(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let formatted = text;

  // Escape HTML
  formatted = formatted
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Apply basic formatting that works well with streaming
  
  // Bold text - apply immediately as it appears
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="bold-text">$1</strong>');
  
  // Inline code - apply immediately
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // Simple headers - only complete ones
  formatted = formatted.replace(/^###\s+(.+)$/gm, '<h4 class="msg-header-3">$1</h4>');
  formatted = formatted.replace(/^##\s+(.+)$/gm, '<h3 class="msg-header-2">$1</h3>');
  formatted = formatted.replace(/^#\s+(.+)$/gm, '<h2 class="msg-header-1">$1</h2>');

  // Simple lists for streaming - apply immediately for complete lines
  formatted = formatted.replace(/^(\d+[\.)]\s.+)$/gm, (match) => {
    const num = (match.match(/^(\d+)/) || [])[1] || '';
    const item = match.replace(/^\d+[\.)]\s*/, '').trim();
    return `<div class="list-item numbered"><span class="list-number">${num}.</span> ${item}</div>`;
  });

  // Lettered list (a., b.)
  formatted = formatted.replace(/^([a-zA-Z][\.)]\s.+)$/gm, (match) => {
    const letter = (match.match(/^([a-zA-Z])/) || [])[1] || '';
    const item = match.replace(/^[a-zA-Z][\.)]\s*/, '').trim();
    return `<div class="list-item numbered"><span class="list-number">${letter}.</span> ${item}</div>`;
  });

  formatted = formatted.replace(/^([•\-*]\s.+)$/gm, (match) => {
    const item = match.replace(/^[•\-*]\s*/, '').trim();
    return `<div class="list-item bullet"><span class="list-bullet">•</span> ${item}</div>`;
  });

  // Simple highlights - apply as they complete
  formatted = formatted.replace(/\[!INFO\](.*?)\[\/!INFO\]/gs, '<span class="highlight-blue">$1</span>');
  formatted = formatted.replace(/\[!SUCCESS\](.*?)\[\/!SUCCESS\]/gs, '<span class="highlight-green">$1</span>');
  formatted = formatted.replace(/\[!WARNING\](.*?)\[\/!WARNING\]/gs, '<span class="highlight-yellow">$1</span>');
  formatted = formatted.replace(/\[!TIP\](.*?)\[\/!TIP\]/gs, '<span class="highlight-green">$1</span>');
  formatted = formatted.replace(/\[!ERROR\](.*?)\[\/!ERROR\]/gs, '<span class="highlight-red">$1</span>');
  formatted = formatted.replace(/\[!IMPORTANT\](.*?)\[\/!IMPORTANT\]/gs, '<span class="highlight-red">$1</span>');
  formatted = formatted.replace(/\[!NOTE\](.*?)\[\/!NOTE\]/gs, '<span class="highlight-blue">$1</span>');

  // Basic line breaks
  formatted = formatted.replace(/\n\n+/g, '<br><br>');
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}

/**
 * Check if the message indicates a completed session
 * @param {string} text - Message text to check
 * @returns {boolean} - True if this appears to be a completion message
 */
export function isSessionComplete(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const completionIndicators = [
    'selesai',
    'done',
    'complete',
    'finished',
    'berhasil',
    'sukses',
    'telah selesai',
    'sudah selesai',
    'task completed',
    'proses selesai'
  ];

  const lowerText = text.toLowerCase();
  return completionIndicators.some(indicator => lowerText.includes(indicator));
}