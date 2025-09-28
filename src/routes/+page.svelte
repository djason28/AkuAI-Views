<script>
  import { onMount, afterUpdate, onDestroy, tick } from "svelte";
  import { goto } from "$app/navigation";
  import "../lib/styles/layout.css";
  import "../lib/styles/header.css";
  import "../lib/styles/sidebar.css";
  import "../lib/styles/chat.css";        // chat area, messages, quick chat
  import "../lib/styles/input.css";       // chat input/footer
  import "../lib/styles/modal.css";       // profile modal
  import "../lib/styles/animation.css";   // keyframes and animations
  import "../lib/styles/responsive.css";  // @media rules
  import { formatBotMessage, formatStreamingBotMessage, formatUserMessage, isSessionComplete } from "../lib/utils/messageFormatter.js";

  // Initialize theme immediately on page load to prevent flash
  if (typeof document !== 'undefined') {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  const API_URL = "http://127.0.0.1:5000";

  let token = "";
  let conversations = [];
  let currentConversation = null;
  let messages = [];
  let inputMessage = "";
  let chatContainer;
  let username = "";
  let searchQuery = "";
  let searchTimeout = null;
  let isSearching = false;
  let isSidebarCollapsed = false;

  // Profile modal variables
  let showProfileModal = false;
  let profileEmail = "";
  let profileUsername = "";
  let profilePassword = "";
  let profileError = "";
  let profileSuccess = "";
  let isUpdatingProfile = false;

  let inputMessageElement;
  let isStreaming = false;
  let streamAbortController = null;
  let stopRequested = false;            // hard-stop current stream (pacing + network)
  let nextSendBypassDuplicate = false;  // one-shot duplicate bypass after user stopped
  // Sequence IDs to prevent stale/aborted run from surfacing errors
  let runSeq = 0;
  let lastStoppedRunSeq = -1;

  function stopStreaming() {
    if (streamAbortController) {
      try { streamAbortController.abort(); } catch (_) {}
      streamAbortController = null;
    }
    stopRequested = true;
    // Mark that the current run sequence was explicitly stopped
    lastStoppedRunSeq = runSeq;
    isStreaming = false;
    showLoadingDots = false;

    // Immediately finalize any currently streaming bot bubble with what we have
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.sender === 'bot' && m.isStreaming) {
        const updated = [...messages];
        const finalText = m.text || "";
        updated[i] = { ...m, isStreaming: false, _preFormattedHTML: formatBotMessage(finalText), _formatted: true };
        messages = updated;
        break;
      }
    }

    // Allow next identical question to bypass duplicate guard (server-side)
    nextSendBypassDuplicate = true;
  }
  
  // Session completion tracking
  let sessionCompleted = false;
  let showDoneIndicator = false;
  let autoReloadTimer = null;
  let showLoadingDots = false;
  // Force remount messages container when needed (soft reload)
  let messagesRenderKey = 0;
  
  // Quick chat dropdown
  let showQuickChatDropdown = false;
  let quickChatItems = [
    "Jelaskan tentang universitas terbaik di Indonesia",
    "Berikan informasi jurusan IT yang prospektif", 
    "Bagaimana cara memilih universitas yang tepat?",
    "Apa saja persyaratan masuk universitas negeri?",
    "Ceritakan tentang biaya kuliah di berbagai universitas",
    "Rekomendasikan beasiswa terbaru dan syaratnya"
  ];

  // Use backend search API instead of client-side filtering
  $: filteredConversations = conversations;

  async function loadConversations(query = "") {
    if (!token) return; // jangan fetch kalau belum login
    
    // Build URL with optional search query
    let url = `${API_URL}/conversations`;
    if (query.trim()) {
      url += `?q=${encodeURIComponent(query.trim())}`;
    }
    
    // Remember if search input was focused before search
    const wasSearchFocused = searchInputElement && document.activeElement === searchInputElement;
    
    isSearching = true;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      conversations = await res.json();
    }
    isSearching = false;
    
    // Restore focus to search input if it was focused before and we have a search query
    if (wasSearchFocused && query.trim() && searchInputElement) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        searchInputElement.focus();
      }, 10);
    }
  }

  // Debounced search function
  function handleSearch() {
    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout for debounced search
    searchTimeout = setTimeout(async () => {
      await loadConversations(searchQuery);
      // Ensure search input stays focused after search completes
      if (searchQuery.trim() && searchInputElement) {
        setTimeout(() => {
          searchInputElement.focus();
        }, 10);
      }
    }, 300); // 300ms debounce
  }

  // Watch searchQuery changes and trigger debounced search
  // Only trigger if we have a token (user is logged in) and after initial load
  let isInitialized = false;
  $: if (isInitialized && token && searchQuery !== null) {
    handleSearch();
  }

  // Function to highlight search terms in conversation titles
  function highlightSearchTerm(text, term) {
    if (!term || !text) return text;
    
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  // Keyboard shortcut for search (Ctrl+K / Cmd+K)
  let searchInputElement;
  
  function handleKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      if (searchInputElement) {
        searchInputElement.focus();
      }
    }
  }

  // IME composition guard so Enter while composing (e.g., Japanese) doesn't send
  let isComposing = false;

  function handleTextareaKeydown(event) {
    if (event.key !== 'Enter') return;

    // Shift+Enter → baris baru (newline) dengan batas 5 baris
    if (event.shiftKey) {
      const currentLines = (inputMessage.match(/\n/g) || []).length + 1;
      const maxLines = 5;
      if (currentLines >= maxLines) {
        event.preventDefault();
      }
      // Resize dan offset setelah newline
      setTimeout(() => {
        autoResizeTextarea();
        if (inputMessageElement) {
          inputMessageElement.scrollTop = inputMessageElement.scrollHeight;
        }
        updateFooterOffset();
      }, 0);
      return;
    }

    // Enter tunggal → kirim pesan (atau stop jika sedang streaming)
    if (!isComposing) {
      event.preventDefault();
      if (isStreaming) {
        // optional convenience: Enter juga menghentikan streaming
        stopStreaming();
      } else {
        sendMessage();
      }
    }
  }

  // Function to auto-resize textarea (cap at 5 lines)
  function autoResizeTextarea() {
    if (!inputMessageElement) return;
    const style = getComputedStyle(inputMessageElement);
    const lineHeight = parseFloat(style.lineHeight || '20');
    const paddingY = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');
    const maxLines = 5;
    const maxHeight = lineHeight * maxLines + paddingY;
    inputMessageElement.style.height = 'auto';
    const target = Math.min(inputMessageElement.scrollHeight, maxHeight);
    inputMessageElement.style.height = target + 'px';
  }

  // Measure footer height and set chat padding offset
  let chatInputElement;
  function updateFooterOffset() {
    try {
      const h = chatInputElement?.getBoundingClientRect().height || 112;
      // Tambah ruang 20px agar tidak mepet
      document.documentElement.style.setProperty('--footer-offset', (h + 20) + 'px');
    } catch (_) {}
  }

  // Quick chat functions
  function toggleQuickChat() {
    showQuickChatDropdown = !showQuickChatDropdown;
  }

  function selectQuickChatItem(item) {
    inputMessage = item;
    showQuickChatDropdown = false;
    if (inputMessageElement) {
      inputMessageElement.focus();
      autoResizeTextarea();
    }
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event) {
    if (showQuickChatDropdown && !event.target.closest('.quick-chat-toggle') && !event.target.closest('.quick-chat-dropdown')) {
      showQuickChatDropdown = false;
    }
  }

  // Add global click handler for quick chat dropdown
  let clickHandlerAdded = false;
  
  $: if (showQuickChatDropdown && !clickHandlerAdded) {
    document.addEventListener('click', handleClickOutside);
    clickHandlerAdded = true;
  } else if (!showQuickChatDropdown && clickHandlerAdded) {
    document.removeEventListener('click', handleClickOutside);
    clickHandlerAdded = false;
  }

  onDestroy(() => {
    if (clickHandlerAdded) {
      document.removeEventListener('click', handleClickOutside);
    }
  });


    async function loadMessages(conversationId) {
    const res = await fetch(`${API_URL}/conversations/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
        const data = await res.json();
        currentConversation = conversationId;
        messages = [...data.messages]; // bikin reaktif
        
        // Reset session state when switching conversations
        showDoneIndicator = false;
        sessionCompleted = false;
        if (autoReloadTimer) {
          clearTimeout(autoReloadTimer);
          autoReloadTimer = null;
        }
    }
    }



  async function newConversation() {
    currentConversation = null;
    messages = [];
    
    // Reset session state
    showDoneIndicator = false;
    sessionCompleted = false;
    if (autoReloadTimer) {
      clearTimeout(autoReloadTimer);
      autoReloadTimer = null;
    }
  }

  async function sendMessage() {
    const text = inputMessage.trim();
    if (!text || isStreaming) return;

    // optimistic append user message
    messages = [...messages, { sender: "user", text }];
    inputMessage = "";
    
    // Reset textarea height
    if (inputMessageElement) {
      inputMessageElement.style.height = 'auto';
    }

    const payload = {
      message: text,
      conversation_id: currentConversation || null
    };

  isStreaming = true;
  stopRequested = false;
  const myRunSeq = ++runSeq; // tag this send operation
  showLoadingDots = true;
    showDoneIndicator = false; // Hide done indicator when starting new message
    if (autoReloadTimer) {
      clearTimeout(autoReloadTimer);
      autoReloadTimer = null;
    }
    streamAbortController = new AbortController();
    let botIndex = -1; // index of the streaming bot message in messages
    let decoder = new TextDecoder();
    let buffer = "";   // raw SSE buffer

    // Pacing state: buffer incoming chunks and reveal them gradually
    let pendingText = "";     // accumulated text not yet shown
    let paceTimer = null;      // current pacing timer
    let paceDone = false;      // server signaled done
    let firstEmit = false;     // whether we've shown the first visible chunk
    let scheduleCount = 0;     // prevent infinite scheduling

    function scheduleNextTick() {
      if (paceTimer) return;
      if (scheduleCount > 1000) {
        console.warn("Too many schedule attempts, stopping");
        paceDone = true;
        return;
      }
      scheduleCount++;
      
  // Faster pacing but smoother cadence
  const delay = firstEmit ? 140 + Math.floor(Math.random() * 120) : 35;
      paceTimer = setTimeout(() => {
        paceTimer = null;
        if (stopRequested) {
          pendingText = "";
          paceDone = true;
        }
        if (pendingText.length === 0) {
          // Nothing to show; if server finished, stop.
          if (paceDone) {
            console.log("Stream completed, schedule count:", scheduleCount);
            return;
          }
          // Otherwise, wait a bit and check again soon (but not too often)
          if (scheduleCount < 50) {
            scheduleNextTick();
          }
          return;
        }
        // Determine chunk size dynamically and avoid breaking words mid-way
        let baseSize;
        if (pendingText.length > 600) {
          baseSize = firstEmit ? 48 + Math.floor(Math.random() * 20) : 30 + Math.floor(Math.random() * 12);
        } else if (pendingText.length > 250) {
          baseSize = firstEmit ? 34 + Math.floor(Math.random() * 16) : 24 + Math.floor(Math.random() * 10);
        } else {
          baseSize = firstEmit ? 24 + Math.floor(Math.random() * 10) : 18 + Math.floor(Math.random() * 8);
        }
        // Try to cut on whitespace or punctuation near the boundary for smoother visuals
        let emitEnd = Math.min(baseSize, pendingText.length);
        const maxLookAhead = 12;
        const maxLookBack = 10;
        if (emitEnd < pendingText.length) {
          // look ahead to next boundary
          let i = emitEnd;
          while (i < pendingText.length && i < emitEnd + maxLookAhead && !/[\s,.;:!?\)]/.test(pendingText[i])) i++;
          if (i < pendingText.length && /[\s,.;:!?\)]/.test(pendingText[i])) {
            emitEnd = i + 1; // include the boundary char
          } else {
            // look back to last boundary
            i = emitEnd - 1;
            while (i > 0 && i > emitEnd - maxLookBack && !/[\s,.;:!?\)]/.test(pendingText[i])) i--;
            if (/[\s,.;:!?\)]/.test(pendingText[i])) {
              emitEnd = i + 1;
            }
          }
        }
        const emit = pendingText.slice(0, emitEnd);
        pendingText = pendingText.slice(emit.length);

        if (botIndex === -1) {
          messages = [...messages, { sender: "bot", text: emit, isStreaming: true }];
          botIndex = messages.length - 1;
          showLoadingDots = false; // Hide loading dots when first response arrives
        } else {
          const updated = [...messages];
          const newText = (updated[botIndex].text || "") + emit;
          updated[botIndex] = { ...updated[botIndex], text: newText, isStreaming: true };
          messages = updated;
        }
        firstEmit = true;

        // If more to show or stream not done, schedule next tick
        if (pendingText.length > 0 || !paceDone) {
          scheduleNextTick();
        } else {
          // Streaming is completely done, mark message as not streaming and clean up
          if (botIndex >= 0 && messages[botIndex]) {
            const updated = [...messages];
            const finalText = (updated[botIndex].text || "");
            updated[botIndex] = { 
              ...updated[botIndex], 
              isStreaming: false,
              _preFormattedHTML: formatBotMessage(finalText),
              _formatted: true
            };
            messages = updated;
          }
          // Allow UI controls to revert to Send
          isStreaming = false;
          // Hide done indicator after a brief delay
          setTimeout(() => {
            showDoneIndicator = false;
          }, 800);
        }
      }, delay);
    }

    // Add timeout for the entire streaming operation
    const streamTimeout = setTimeout(() => {
      if (streamAbortController) {
        console.log("Stream timeout - aborting");
        streamAbortController.abort();
      }
    }, 60000); // 60 second timeout

    let completedNormally = false; // visible to catch/finally of this run
    try {
      const res = await fetch(`${API_URL}/conversations/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          Authorization: `Bearer ${token}`,
          ...(nextSendBypassDuplicate ? { "X-Bypass-Duplicate": "1" } : {})
        },
        body: JSON.stringify(payload),
        signal: streamAbortController.signal
      });
      nextSendBypassDuplicate = false;

      if (!res.ok || !res.body) {
        clearTimeout(streamTimeout);
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

  const reader = res.body.getReader();
      let chunkCount = 0;
      let lastChunkTime = Date.now();
  let shouldClose = false; // set true to break the outer read loop after handling 'done'
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          clearTimeout(streamTimeout);
          break;
        }
        
        chunkCount++;
        lastChunkTime = Date.now();
        buffer += decoder.decode(value, { stream: true });
        
        // Log progress for debugging
        if (chunkCount % 10 === 0) {
          console.log(`Processed ${chunkCount} chunks, buffer size: ${buffer.length}`);
        }

        // parse SSE chunks: split by double newlines for events
        let parts = buffer.split("\n\n");
        // keep last incomplete part in buffer
        buffer = parts.pop();
        for (const part of parts) {
          const lines = part.split(/\r?\n/);
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              event = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              // Preserve spaces in SSE data chunks by NOT trimming
              // Many providers send partial tokens without trailing space; trimming causes words to stick
              data += line.slice(5);
            }
          }

          if (event === "user_saved") {
            try {
              const obj = JSON.parse(data);
              if (obj && obj.conversation_id) {
                currentConversation = obj.conversation_id;
                // refresh conversation list so the new/updated conv appears
                loadConversations(searchQuery);
              }
            } catch (_) {}
          } else if (event === "delta") {
            const chunk = data.replace(/\\n/g, "\n");
            pendingText += chunk;
            scheduleNextTick();
          } else if (event === "done") {
            // Server finished sending tokens; keep pacing until buffer drains
            console.log("🎯 DONE event received; finishing pacing...");
            paceDone = true;
            showLoadingDots = false;
            // If there's buffered text and no timer, schedule the final drains
            if (pendingText.length > 0 && !paceTimer) {
              scheduleNextTick();
            }
            // Close stream but do NOT cancel pacing timers; they will drain remaining text
            shouldClose = true;
            completedNormally = true;
            try { await reader.cancel(); } catch (_) {}
          }
        }
        // After processing this batch of parts, exit loop if completion was signaled
        if (shouldClose) {
          clearTimeout(streamTimeout);
          break;
        }
      }
    } catch (err) {
      // Suppress console noise for manual stops; log others
      const wasManuallyStopped = lastStoppedRunSeq === myRunSeq;
      const isAbortError = err && err.name === 'AbortError';
      if (!wasManuallyStopped || !isAbortError) {
        console.error("Stream error:", err);
      }
      
      // Only affect UI state if this is still the latest run
      if (myRunSeq === runSeq) { showLoadingDots = false; }
      clearTimeout(streamTimeout);
      
      let errorMessage = "";
      if (err && err.name === 'AbortError') {
        if (completedNormally) {
          // Ignore aborts triggered by our own completion cleanup
          console.log("🟡 Stream cancelled normally after completion");
        } else {
          errorMessage = "Stream dibatalkan atau timeout.";
        }
      } else if (err && err.message && err.message.includes('HTTP')) {
        errorMessage = `Server error: ${err.message}`;
      } else {
        errorMessage = "Maaf, terjadi kesalahan saat streaming.";
      }
      
      const isStale = myRunSeq !== runSeq; // a newer send started
      if (errorMessage && !wasManuallyStopped && !isStale) {
        messages = [...messages, { sender: "bot", text: errorMessage, _k: Date.now() }];
      }
    } finally {
      // Do not prematurely stop pacing; let scheduleNextTick drain the buffer
      if (myRunSeq === runSeq) {
        showLoadingDots = false;
        streamAbortController = null;
      }
      clearTimeout(streamTimeout);
      console.log("Stream cleanup completed, total schedules:", scheduleCount);
      // If there's still buffered text, ensure a pacing tick is scheduled
      if (!stopRequested && pendingText.length > 0 && !paceTimer) {
        scheduleNextTick();
      }
      // After drained (handled inside scheduleNextTick), mark message complete and pre-format once
      // We detect completion inside scheduleNextTick when pendingText is empty and paceDone is true.
      if (autoReloadTimer) { clearTimeout(autoReloadTimer); autoReloadTimer = null; }
      // Keep conversations list fresh
      loadConversations(searchQuery);
      // Ensure send button returns after completion/abort
      if (myRunSeq === runSeq) { isStreaming = false; }
    }
  }


async function deleteConversation(conversationId) {
    const res = await fetch(`${API_URL}/conversations/${conversationId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      // hapus dari state frontend
      conversations = conversations.filter(c => c.id !== conversationId);
      if (currentConversation === conversationId) {
        currentConversation = null;
        messages = [];
      }
    } else {
      console.error("Gagal delete:", await res.text());
    }
  }

  // Theme management
  let isDarkMode = true;

  function toggleTheme() {
    isDarkMode = !isDarkMode;
    const theme = isDarkMode ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    isDarkMode = theme === 'dark';
    localStorage.setItem('theme', theme);
  }

  // Logout function
  async function logout() {
    try {
      // Call backend logout endpoint to revoke token
      await fetch(`${API_URL}/logout`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}` 
        }
      });
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      // Always remove local storage and redirect, even if backend call fails
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      goto("/login");
    }
  }

  // Profile modal functions
  let modalElement;
  let previouslyFocused;

  // Focus trap for modal
  function trapFocus(event) {
    if (!modalElement) return;
    
    const focusableElements = modalElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (event.key === 'Tab') {
      if (event.shiftKey) {
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    }
  }

  async function openProfileModal() {
    // Store currently focused element
    previouslyFocused = document.activeElement;
    
  showProfileModal = true;
  // Lock background scroll
  try { document.documentElement.style.overflow = 'hidden'; } catch (_) {}
    profileError = "";
    profileSuccess = "";
    
    // Load current profile data
    try {
      const res = await fetch(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        profileEmail = data.email;
        profileUsername = data.username;
        profilePassword = "";
      } else {
        profileError = "Gagal memuat data profil";
      }
    } catch (error) {
      profileError = "Terjadi kesalahan saat memuat profil";
    }

    // Focus first input after modal is rendered
    setTimeout(() => {
      const firstInput = modalElement?.querySelector('input');
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);
  }

  function closeProfileModal() {
    showProfileModal = false;
    profileError = "";
    profileSuccess = "";
    profilePassword = "";

    // Restore background scroll
    try { document.documentElement.style.overflow = ''; } catch (_) {}

    // Restore focus to previously focused element
    if (previouslyFocused) {
      previouslyFocused.focus();
    }
  }

  async function updateProfile() {
    if (isUpdatingProfile) return;
    
    profileError = "";
    profileSuccess = "";
    
    // Basic validation
    if (!profileEmail.trim() || !profileUsername.trim()) {
      profileError = "Email dan username wajib diisi";
      return;
    }

    const updateData = {
      email: profileEmail.trim().toLowerCase(),
      username: profileUsername.trim(),
    };
      
    if (profilePassword) {
      updateData.password = profilePassword;
    }

    isUpdatingProfile = true;
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      });

      if (res.ok) {
        profileSuccess = "Profil berhasil diperbarui";
        username = profileUsername.trim(); // Update displayed username
        localStorage.setItem("username", username);
        profilePassword = "";
        setTimeout(() => {
          closeProfileModal();
        }, 1500);
      } else {
        const err = await res.json();
        profileError = err.msg || "Gagal memperbarui profil";
      }
    } catch (error) {
      profileError = "Terjadi kesalahan saat memperbarui profil";
    } finally {
      isUpdatingProfile = false;
    }
  }

  // Delete all history (all conversations for current user)
  async function deleteAllHistory() {
    if (!token) return;
    const confirmDelete = confirm("Hapus semua riwayat percakapan? Tindakan ini tidak bisa dibatalkan.");
    if (!confirmDelete) return;
    try {
      const res = await fetch(`${API_URL}/conversations`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        conversations = [];
        currentConversation = null;
        messages = [];
        profileSuccess = "Semua riwayat percakapan berhasil dihapus.";
        setTimeout(() => { profileSuccess = ""; }, 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        profileError = err.msg || "Gagal menghapus semua riwayat.";
      }
    } catch (e) {
      profileError = "Terjadi kesalahan jaringan.";
    }
  }

  // Quick chat with auto-focus
  function selectQuickChat(message) {
    inputMessage = message;
    // Focus the input element after setting the message
    if (inputMessageElement) {
      setTimeout(() => {
        inputMessageElement.focus();
      }, 10);
    }
  }

  onMount(() => {
    token = localStorage.getItem("token") || "";
    if (!token) {
      goto("/login");
      return;
    }
    
    // Load username from localStorage
    username = localStorage.getItem("username") || "User";
    
    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
    
    loadConversations();
    isInitialized = true; // Mark as initialized after first load
    // Sync footer offset initially and on resize
    setTimeout(updateFooterOffset, 0);
    let ro;
    try {
      ro = new ResizeObserver(() => updateFooterOffset());
      if (chatInputElement) ro.observe(chatInputElement);
    } catch (_) {}
    window.addEventListener('resize', updateFooterOffset);
    
    // Add keyboard shortcut listener
    document.addEventListener('keydown', handleKeydown);
    
    // Cleanup function
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      if (autoReloadTimer) {
        clearTimeout(autoReloadTimer);
      }
      try { ro && ro.disconnect && ro.disconnect(); } catch (_) {}
      window.removeEventListener('resize', updateFooterOffset);
    };
  });

  // Simple portal action: moves an element to document.body while keeping Svelte reactivity
  function portal(node) {
    const target = document.body;
    target.appendChild(node);
    return {
      destroy() {
        if (node && node.parentNode === target) target.removeChild(node);
      }
    };
  }

    // setiap messages berubah → scroll ke bawah
  afterUpdate(() => {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  });
</script>

<div class="app" class:blurred={showProfileModal}>
  <!-- Global Header -->
  <header class="app-header">
    <div class="header-left">
      <button class="hamburger-btn" on:click={() => isSidebarCollapsed = !isSidebarCollapsed} aria-label="Toggle sidebar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="9" y1="9" x2="15" y2="9"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="15" y2="17"/>
        </svg>
      </button>
      <h1>AkuAI</h1>
    </div>
    <div class="header-spacer">
      <div class="header-status">
        {#if currentConversation}
          <span class="status-indicator active"></span>
          <span class="status-text">Chat Aktif</span>
        {:else}
          <span class="status-indicator"></span>
          <span class="status-text">Siap untuk Chat</span>
        {/if}
      </div>
    </div>
    <div class="header-controls">
      <button class="theme-btn" class:active={isDarkMode} aria-label="Switch to dark mode" on:click={() => applyTheme('dark')}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
        </svg>
      </button>
      <button class="theme-btn" class:active={!isDarkMode} aria-label="Switch to light mode" on:click={() => applyTheme('light')}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/>
        </svg>
      </button>
    </div>
  </header>

<div class="container" class:sidebar-collapsed={isSidebarCollapsed}>
  <!-- Sidebar -->
  <aside class="sidebar" class:collapsed={isSidebarCollapsed}>
    <div class="sidebar-header">
      <div class="profile-section">
  <button class="profile-avatar-btn" on:click={openProfileModal} aria-label="Edit Profile">
          <div class="profile-avatar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
            <div class="profile-edit-overlay">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708L12.854.146zm.646 4.24L11.207 6.68l3.713 3.713L16.213 8.1 13.5 4.386zM10.5 7.387L4.387 13.5H6v1a.5.5 0 0 0 .5.5h1v1.5a.5.5 0 0 0 .5.5h1v1.5a.5.5 0 0 0 .5.5h1v1h-4A1.5 1.5 0 0 1 4 17.5v-13A1.5 1.5 0 0 1 5.5 3h5.793L10.5 7.387z"/>
              </svg>
            </div>
          </div>
        </button>
        <div class="profile-info">
          <div class="profile-name">{username}</div>
        </div>
        <button class="logout-btn" on:click={logout} aria-label="Logout">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
            <path d="m15.854 8.354-3-3a.5.5 0 0 0-.708.708L14.293 8H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708z"/>
          </svg>
        </button>
      </div>
      <button class="new-chat" on:click={newConversation}>New Chat</button>
      
      <!-- Search History -->
      <div class="search-container">
        <div class="search-input-wrapper">
          {#if isSearching}
            <!-- Loading spinner -->
            <svg class="search-icon search-loading" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="32" stroke-dashoffset="32">
                <animateTransform attributeName="transform" type="rotate" dur="1s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
              </circle>
            </svg>
          {:else}
            <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
          {/if}
          <input 
            type="text" 
            class="search-input" 
            placeholder="Search conversations and messages... (Ctrl+K)" 
            bind:value={searchQuery}
            bind:this={searchInputElement}
            disabled={isSearching}
            on:input={() => {
              // Maintain focus during typing
              if (searchInputElement && document.activeElement !== searchInputElement) {
                searchInputElement.focus();
              }
            }}
          />
          {#if searchQuery && !isSearching}
            <button class="search-clear" aria-label="Clear search" on:click={() => {
              searchQuery = "";
              loadConversations(); // Reload all conversations when clearing search
              // Keep focus on search input after clearing
              setTimeout(() => {
                if (searchInputElement) {
                  searchInputElement.focus();
                }
              }, 10);
            }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
              </svg>
            </button>
          {/if}
        </div>
      </div>
    </div>
    <ul>
      {#if searchQuery && filteredConversations.length === 0}
        <li class="no-results">
          <div class="no-results-text">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
            <span>No conversations found</span>
          </div>
        </li>
      {:else}
        {#each filteredConversations as conv}
        <li class:selected={currentConversation === conv.id}>
          <button type="button" class="conv-title" on:click={() => loadMessages(conv.id)}>
            {@html highlightSearchTerm(conv.title, searchQuery)}
          </button>
          <button
            class="delete-btn"
            aria-label="Delete conversation"
            on:click={() => deleteConversation(conv.id)}
          >
          </button>
        </li>
      {/each}
      {/if}
    </ul>
  </aside>

  <!-- Main Chat -->
  <main class="chat">
    <div class="chat-messages" bind:this={chatContainer}>
      {#key messagesRenderKey}
      {#if messages.length === 0}
        <div class="empty empty-rich">
          <div class="empty-title">Apa yang bisa kami bantu?</div>
          <div class="empty-grid">
            {#each quickChatItems.slice(0,6) as item}
              <button class="empty-quick-btn" on:click={() => selectQuickChatItem(item)}>
                {item}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        {#each messages as msg, i (msg._k ?? (i + '-' + (msg.isStreaming ? '1' : '0')))}
          <div class="message {msg.sender}" 
               class:streaming={msg.isStreaming} 
               class:formatted={msg._formatted}
               class:nuclear={msg._nuclear}>
            {#if msg.sender === 'bot'}
              {#if msg.isStreaming}
                {@html formatStreamingBotMessage(msg.text)}
              {:else if msg._nuclear && msg._preFormattedHTML}
                <!-- Nuclear: Use pre-formatted HTML directly -->
                {@html msg._preFormattedHTML}
              {:else if msg._preFormattedHTML}
                {@html msg._preFormattedHTML}
              {:else}
                {@html formatBotMessage(msg.text)}
              {/if}
            {:else}
              {@html formatUserMessage(msg.text)}
            {/if}
          </div>
        {/each}        <!-- Loading spinner indicator -->
        {#if showLoadingDots}
          <div class="bot-loading">
            <div class="loading-spinner">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
            </div>
          </div>
        {/if}
      {/if}
      {/key}
      
      <!-- Done indicator -->
      {#if showDoneIndicator}
        <div class="done-indicator">
          <div class="done-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            <span>Reloading chat in 2s...</span>
          </div>
          <p class="done-message">Getting formatted messages �</p>
        </div>
      {/if}
    </div>

    <!-- Sticky input -->
  <footer class="chat-input" bind:this={chatInputElement}>
      <!-- Quick chat toggle button -->
      <button 
        class="quick-chat-toggle"
        class:active={showQuickChatDropdown}
        on:click|stopPropagation={toggleQuickChat}
        aria-label="Quick chat options"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <path d="M8 9h8"/>
          <path d="M8 13h6"/>
        </svg>

        <!-- Quick chat dropdown -->
        <div class="quick-chat-dropdown" class:show={showQuickChatDropdown}>
          {#each quickChatItems as item}
            <div 
              class="quick-chat-item" 
              role="button"
              tabindex="0"
              on:click|stopPropagation={() => selectQuickChatItem(item)}
              on:keydown|stopPropagation={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectQuickChatItem(item);
                }
              }}
            >
              {item}
            </div>
          {/each}
        </div>
      </button>

      <textarea
        placeholder="Tulis pertanyaan..."
        bind:value={inputMessage}
        bind:this={inputMessageElement}
        on:keydown={handleTextareaKeydown}
        on:compositionstart={() => (isComposing = true)}
        on:compositionend={() => (isComposing = false)}
        on:input={() => { autoResizeTextarea(); updateFooterOffset(); }}
        rows="1"
      ></textarea>
      
      <button 
        class="send-btn" 
        class:loading={isStreaming}
        on:click={isStreaming ? stopStreaming : sendMessage}
        aria-label={isStreaming ? "Hentikan" : "Kirim pesan"}
        title={isStreaming ? "Hentikan" : "Kirim"}
      >
        {#if isStreaming}
          <!-- Stop icon -->
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="1" ry="1"></rect>
          </svg>
        {:else}
          <!-- Send icon -->
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22,2 15,22 11,13 2,9"></polygon>
          </svg>
        {/if}
      </button>
      <button class="new-chat-btn" on:click={newConversation} aria-label="New chat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </footer>
  </main>
</div>
</div>

<!-- Profile Edit Modal -->
{#if showProfileModal}
  <div 
    class="modal-overlay" 
    use:portal
    style="position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; z-index: 999999 !important; background: rgba(0,0,0,0.4) !important; backdrop-filter: blur(6px) !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 20px !important;"
    role="button"
    tabindex="0"
    aria-label="Close modal"
    on:click={closeProfileModal}
    on:keydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeProfileModal();
      }
    }}
  >
    <div 
      class="profile-modal" 
      style="position: relative !important; width: 60vw !important; max-width: 1000px !important; background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%) !important; border: 2px solid rgba(148,163,184,0.25) !important; border-radius: 16px !important; box-shadow: 0 25px 50px rgba(0,0,0,0.25), 0 8px 32px rgba(0,0,0,0.12) !important; z-index: 1 !important;"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      tabindex="-1"
      bind:this={modalElement}
      on:click|stopPropagation
      on:keydown|stopPropagation={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeProfileModal();
        } else {
          trapFocus(e);
        }
      }}
    >
      <div class="modal-header" style="padding: 20px 32px 16px 32px; border-bottom: 2px solid rgba(148,163,184,0.2); background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%); border-radius: 16px 16px 0 0;">
        <h2 id="profile-modal-title" style="margin: 0; font-size: 1.5rem; font-weight: 700; background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">My profile</h2>
      </div>

      <div class="modal-content" style="padding: 24px 32px 28px 32px; background: rgba(5,15,30,0.6); border-radius: 0 0 16px 16px;">
        {#if profileError}
          <div class="error-message">{profileError}</div>
        {/if}
        {#if profileSuccess}
          <div class="success-message">{profileSuccess}</div>
        {/if}

        <!-- Avatar removed per request -->

        <form on:submit|preventDefault={updateProfile}>
          <div class="form-group">
            <label for="profile-name">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              Name
            </label>
            <div class="input-wrapper">
              <input
                id="profile-name"
                type="text"
                name="name"
                autocomplete="name"
                bind:value={profileUsername}
                placeholder="Enter your full name"
                required
                style="width: 100%; padding: 16px 20px; border: 2px solid rgba(148,163,184,0.15); border-radius: 14px; background: rgba(15,23,42,0.4); color: #f1f5f9; font-size: 1rem; font-weight: 500; transition: all 0.3s ease; backdrop-filter: blur(10px); box-shadow: inset 0 1px 0 rgba(148,163,184,0.08);"
              />
              <div class="input-glow"></div>
            </div>
          </div>

          <div class="form-group">
            <label for="profile-email">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
              Email Address
            </label>
            <div class="input-wrapper">
              <input
                id="profile-email"
                type="email"
                name="email"
                autocomplete="email"
                bind:value={profileEmail}
                placeholder="your.email@example.com"
                required
                style="width: 100%; padding: 16px 20px; border: 2px solid rgba(148,163,184,0.15); border-radius: 14px; background: rgba(15,23,42,0.4); color: #f1f5f9; font-size: 1rem; font-weight: 500; transition: all 0.3s ease; backdrop-filter: blur(10px); box-shadow: inset 0 1px 0 rgba(148,163,184,0.08);"
              />
              <div class="input-glow"></div>
            </div>
          </div>

          <div class="form-group">
            <label for="profile-password">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
                <path d="M18,8h-1V6c0-2.76-2.24-5-5-5S7,3.24,7,6v2H6c-1.1,0-2,0.9-2,2v10c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V10C20,8.9,19.1,8,18,8z M12,17c-1.1,0-2-0.9-2-2s0.9-2,2-2s2,0.9,2,2S13.1,17,12,17z M15.1,8H8.9V6c0-1.71,1.39-3.1,3.1-3.1s3.1,1.39,3.1,3.1V8z"/>
              </svg>
              New Password <span style="color: #94a3b8; font-weight: 400;">(optional)</span>
            </label>
            <div class="input-wrapper">
              <input
                id="profile-password"
                type="password"
                name="new-password"
                autocomplete="new-password"
                bind:value={profilePassword}
                placeholder="Leave empty to keep current password"
                style="width: 100%; padding: 16px 20px; border: 2px solid rgba(148,163,184,0.15); border-radius: 14px; background: rgba(15,23,42,0.4); color: #f1f5f9; font-size: 1rem; font-weight: 500; transition: all 0.3s ease; backdrop-filter: blur(10px); box-shadow: inset 0 1px 0 rgba(148,163,184,0.08);"
              />
              <div class="input-glow"></div>
            </div>
          </div>

          <!-- Button Row (all 3 buttons in one line) -->
          <div style="display: flex; gap: 12px; margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(148,163,184,0.15);">
            <button 
              type="button" 
              class="btn-danger" 
              on:click={deleteAllHistory}
              style="flex: 1; padding: 14px 20px; background: linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(220,38,38,0.2) 100%); color: #fca5a5; border: 1px solid rgba(239,68,68,0.4); border-radius: 12px; font-weight: 600; font-size: 0.95rem; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(239,68,68,0.15);"
            >
              Delete All
            </button>
            
            <button 
              type="button" 
              class="btn-cancel" 
              on:click={closeProfileModal}
              style="flex: 1; padding: 14px 20px; background: rgba(148,163,184,0.12); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.25); border-radius: 12px; font-weight: 600; font-size: 0.95rem; cursor: pointer; transition: all 0.3s ease; backdrop-filter: blur(8px);"
            >
              Cancel
            </button>
            
            <button 
              type="submit" 
              class="btn-save" 
              disabled={isUpdatingProfile}
              style="flex: 1; padding: 14px 20px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 0.95rem; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 14px rgba(99,102,241,0.3), inset 0 1px 0 rgba(255,255,255,0.15); position: relative; overflow: hidden;"
            >
              <span style="position: relative; z-index: 1;">
                {isUpdatingProfile ? "Saving..." : "Save Changes"}
              </span>
              <div style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transition: left 0.6s;"></div>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}




<style>
  /* Custom input and label styling for both themes */
  :global(.form-group) {
    margin-bottom: 24px;
  }
  
  :global(.form-group label) {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    text-shadow: 0 1px 2px rgba(0,0,0,0.1);
    transition: color 0.3s ease;
  }
  
  /* Dark theme labels */
  :global([data-theme="dark"] .form-group label),
  :global(.form-group label) {
    color: #e2e8f0;
  }
  
  /* Light theme labels */
  :global([data-theme="light"] .form-group label) {
    color: #374151;
    text-shadow: 0 1px 2px rgba(255,255,255,0.5);
  }
  
  :global(.input-wrapper) {
    position: relative;
  }
  
  :global(.input-glow) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 14px;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
    z-index: -1;
  }
  
  /* Dark theme input glow */
  :global([data-theme="dark"] .input-glow),
  :global(.input-glow) {
    background: linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(168,85,247,0.1) 100%);
  }
  
  /* Light theme input glow */
  :global([data-theme="light"] .input-glow) {
    background: linear-gradient(135deg, rgba(236,72,153,0.08) 0%, rgba(168,85,247,0.08) 100%);
  }
  
  :global(.form-group input:focus + .input-glow) {
    opacity: 1;
  }
  
  /* Dark theme input focus */
  :global([data-theme="dark"] .form-group input:focus),
  :global(.form-group input:focus) {
    border-color: rgba(99,102,241,0.6) !important;
    background: rgba(15,23,42,0.7) !important;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.12), inset 0 1px 0 rgba(148,163,184,0.1), 0 8px 25px rgba(99,102,241,0.15) !important;
    transform: translateY(-1px) !important;
  }
  
  /* Light theme input focus */
  :global([data-theme="light"] .form-group input:focus) {
    border-color: rgba(236,72,153,0.6) !important;
    background: rgba(255,255,255,0.9) !important;
    box-shadow: 0 0 0 3px rgba(236,72,153,0.08), inset 0 1px 0 rgba(148,163,184,0.1), 0 8px 25px rgba(236,72,153,0.1) !important;
    transform: translateY(-1px) !important;
    color: #1f2937 !important;
  }
  
  /* Dark theme placeholder */
  :global([data-theme="dark"] .form-group input::placeholder),
  :global(.form-group input::placeholder) {
    color: #64748b;
    font-style: italic;
  }
  
  /* Light theme placeholder */
  :global([data-theme="light"] .form-group input::placeholder) {
    color: #9ca3af;
    font-style: italic;
  }
  
  /* Dark theme button hover effects */
  :global([data-theme="dark"] .btn-cancel:hover),
  :global(.btn-cancel:hover) {
    background: rgba(148,163,184,0.18) !important;
    color: #f1f5f9 !important;
    border-color: rgba(148,163,184,0.35) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 20px rgba(148,163,184,0.2) !important;
  }
  
  /* Light theme button hover effects */
  :global([data-theme="light"] .btn-cancel:hover) {
    background: rgba(148,163,184,0.15) !important;
    color: #1f2937 !important;
    border-color: rgba(148,163,184,0.3) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 20px rgba(148,163,184,0.15) !important;
  }
  
  :global(.btn-save:hover:not(:disabled)) {
    transform: translateY(-2px) !important;
    box-shadow: 0 8px 25px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  
  :global(.btn-save:hover:not(:disabled) > div) {
    left: 100% !important;
  }
  
  :global(.btn-danger:hover) {
    background: linear-gradient(135deg, rgba(239,68,68,0.25) 0%, rgba(220,38,38,0.35) 100%) !important;
    color: #fff !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 8px 25px rgba(239,68,68,0.3) !important;
  }
  
  :global(.btn-save:disabled) {
    opacity: 0.6 !important;
    cursor: not-allowed !important;
    transform: none !important;
  }
  
  /* Modal content spacing - responsive to theme */
  :global([data-theme="dark"] .modal-content),
  :global(.modal-content) {
    /* Dark theme handled by inline styles */
    padding: 24px 32px 28px 32px;
  }
  
  :global([data-theme="light"] .modal-content) {
    background: rgba(248,250,252,0.8) !important;
    border-radius: 0 0 16px 16px !important;
    backdrop-filter: blur(10px) !important;
  }
  
  :global([data-theme="dark"] .modal-header),
  :global(.modal-header) {
    /* Dark theme handled by inline styles */
    padding: 20px 32px 16px 32px;
  }
  
  :global([data-theme="light"] .modal-header) {
    background: linear-gradient(145deg, #fef7ff 0%, #f8fafc 100%) !important;
    border-bottom: 2px solid rgba(236,72,153,0.15) !important;
    border-radius: 16px 16px 0 0 !important;
  }
  
  :global([data-theme="light"] .modal-header h2) {
    background: linear-gradient(135deg, #1f2937 0%, #374151 100%) !important;
    -webkit-background-clip: text !important;
    -webkit-text-fill-color: transparent !important;
    background-clip: text !important;
  }
  
  /* Error/Success messages for both themes */
  :global(.error-message), :global(.success-message) {
    margin-bottom: 20px;
    padding: 14px 18px;
    border-radius: 12px;
    font-size: 0.9rem;
    font-weight: 500;
    backdrop-filter: blur(8px);
  }
  
  :global(.error-message) {
    background: linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(220,38,38,0.15) 100%);
    border: 1px solid rgba(239,68,68,0.25);
    box-shadow: 0 4px 12px rgba(239,68,68,0.1);
  }
  
  :global([data-theme="dark"] .error-message) {
    color: #fca5a5;
  }
  
  :global([data-theme="light"] .error-message) {
    color: #dc2626;
    background: linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(220,38,38,0.1) 100%);
  }
  
  :global(.success-message) {
    background: linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(22,163,74,0.15) 100%);
    border: 1px solid rgba(34,197,94,0.25);
    box-shadow: 0 4px 12px rgba(34,197,94,0.1);
  }
  
  :global([data-theme="dark"] .success-message) {
    color: #86efac;
  }
  
  :global([data-theme="light"] .success-message) {
    color: #16a34a;
    background: linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(22,163,74,0.1) 100%);
  }
  
  /* Light theme input styling */
  :global([data-theme="light"] .form-group input) {
    background: rgba(255,255,255,0.7) !important;
    border: 2px solid rgba(148,163,184,0.2) !important;
    color: #1f2937 !important;
    backdrop-filter: blur(8px) !important;
  }
  
  /* Light theme button styling */
  :global([data-theme="light"] .btn-cancel) {
    background: rgba(148,163,184,0.1) !important;
    color: #64748b !important;
    border: 1px solid rgba(148,163,184,0.3) !important;
  }
  
  :global([data-theme="light"] .btn-danger) {
    background: linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(220,38,38,0.15) 100%) !important;
    color: #dc2626 !important;
    border: 1px solid rgba(239,68,68,0.3) !important;
  }
  
  :global([data-theme="light"] .btn-danger:hover) {
    background: linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(220,38,38,0.25) 100%) !important;
    color: #991b1b !important;
  }
</style>



