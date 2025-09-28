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

  // Profile editing variables
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
    "Ceritakan tentang biaya kuliah di berbagai universitas"
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

  function handleKeyPress(event) {
    if (event.key === 'Enter') {
      if (event.shiftKey) {
        // Shift+Enter: allow new line (default textarea behavior)
        // Auto-resize textarea
        setTimeout(() => {
          if (inputMessageElement) {
            inputMessageElement.style.height = 'auto';
            inputMessageElement.style.height = inputMessageElement.scrollHeight + 'px';
          }
        }, 0);
        return;
      } else {
        // Enter without Shift: send message
        event.preventDefault();
        sendMessage();
      }
    }
  }

  // Function to auto-resize textarea
  function autoResizeTextarea() {
    if (inputMessageElement) {
      inputMessageElement.style.height = 'auto';
      inputMessageElement.style.height = inputMessageElement.scrollHeight + 'px';
    }
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
            updated[botIndex] = { ...updated[botIndex], isStreaming: false };
            messages = updated;
          }
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

    try {
      const res = await fetch(`${API_URL}/conversations/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload),
        signal: streamAbortController.signal
      });

      if (!res.ok || !res.body) {
        clearTimeout(streamTimeout);
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

  const reader = res.body.getReader();
      let chunkCount = 0;
      let lastChunkTime = Date.now();
  let shouldClose = false; // set true to break the outer read loop after handling 'done'
  let completedNormally = false; // marks that we reached 'done' from server
      
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
      console.error("Stream error:", err);
      showLoadingDots = false;
      clearTimeout(streamTimeout);
      
      let errorMessage = "";
      if (err.name === 'AbortError') {
        if (completedNormally) {
          // Ignore aborts triggered by our own completion cleanup
          console.log("🟡 Stream cancelled normally after completion");
        } else {
          errorMessage = "Stream dibatalkan atau timeout.";
        }
      } else if (err.message.includes('HTTP')) {
        errorMessage = `Server error: ${err.message}`;
      } else {
        errorMessage = "Maaf, terjadi kesalahan saat streaming.";
      }
      
      if (errorMessage) {
        messages = [...messages, { sender: "bot", text: errorMessage, _k: Date.now() }];
      }
    } finally {
      // Do not prematurely stop pacing; let scheduleNextTick drain the buffer
      showLoadingDots = false;
      streamAbortController = null;
      clearTimeout(streamTimeout);
      console.log("Stream cleanup completed, total schedules:", scheduleCount);
      // If there's still buffered text, ensure a pacing tick is scheduled
      if (pendingText.length > 0 && !paceTimer) {
        scheduleNextTick();
      }
      // After drained (handled inside scheduleNextTick), mark message complete and pre-format once
      // We detect completion inside scheduleNextTick when pendingText is empty and paceDone is true.
      if (autoReloadTimer) { clearTimeout(autoReloadTimer); autoReloadTimer = null; }
      // Keep conversations list fresh
      loadConversations(searchQuery);
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

  // Profile editing functions
  async function openProfileModal() {
    showProfileModal = true;
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
        profileError = "Failed to load profile data";
      }
    } catch (error) {
      profileError = "Error loading profile data";
    }
  }

  function closeProfileModal() {
    showProfileModal = false;
    profileError = "";
    profileSuccess = "";
    profilePassword = "";
  }

  async function updateProfile() {
    if (isUpdatingProfile) return;
    
    profileError = "";
    profileSuccess = "";
    
    // Basic validation
    if (!profileEmail.trim() || !profileUsername.trim()) {
      profileError = "Email and username are required";
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(profileEmail.trim())) {
      profileError = "Invalid email format";
      return;
    }

    // Password validation if provided
    if (profilePassword && profilePassword.length < 6) {
      profileError = "Password must be at least 6 characters";
      return;
    }

    isUpdatingProfile = true;

    try {
      const updateData = {
        email: profileEmail.trim().toLowerCase(),
        username: profileUsername.trim(),
      };
      
      if (profilePassword) {
        updateData.password = profilePassword;
      }

      const res = await fetch(`${API_URL}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      });

      if (res.ok) {
        profileSuccess = "Profile updated successfully";
        username = profileUsername.trim(); // Update displayed username
        localStorage.setItem("username", username);
        profilePassword = "";
        setTimeout(() => {
          closeProfileModal();
        }, 1500);
      } else {
        const err = await res.json();
        profileError = err.msg || "Failed to update profile";
      }
    } catch (error) {
      profileError = "Error updating profile";
    } finally {
      isUpdatingProfile = false;
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
    };
  });

    // setiap messages berubah → scroll ke bawah
  afterUpdate(() => {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  });
</script>

<div class="app">
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
        <p class="empty">Belum ada pesan. Mulai percakapan baru!</p>
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
    <footer class="chat-input">
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
        placeholder="Tulis pertanyaan... (Shift+Enter untuk baris baru)"
        bind:value={inputMessage}
        bind:this={inputMessageElement}
        on:keydown={handleKeyPress}
        on:input={autoResizeTextarea}
        rows="1"
      ></textarea>
      
      <button 
        class="send-btn" 
        class:loading={isStreaming}
        on:click={sendMessage} 
        disabled={isStreaming}
        aria-label="Send message"
      >
        {#if isStreaming}
          <!-- Spinner icon for loading -->
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
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
    role="button"
    tabindex="0"
    aria-label="Close profile modal"
    on:click={closeProfileModal}
    on:keydown={(e) => (e.key === "Escape" || e.key === "Enter" || e.key === " ") && closeProfileModal()}
  >
    <div
      class="profile-modal"
      role="dialog"
      aria-modal="true"
      on:click|stopPropagation
      tabindex="0"
      on:keydown={(e) => (e.key === "Escape") && closeProfileModal()}
    >
      <div class="modal-header">
        <h2>Edit Profile</h2>
        <button class="close-btn" on:click={closeProfileModal} aria-label="Close">
          ×
        </button>
      </div>

      <div class="modal-content">
        {#if profileError}
          <div class="error-message">{profileError}</div>
        {/if}
        {#if profileSuccess}
          <div class="success-message">{profileSuccess}</div>
        {/if}

        <form on:submit|preventDefault={updateProfile}>
          <div class="form-group">
            <label for="profile-email">Email</label>
            <input
              id="profile-email"
              type="email"
              bind:value={profileEmail}
              placeholder="admin@gmail.com"
              required
            />
          </div>

          <div class="form-group">
            <label for="profile-username">Username</label>
            <input
              id="profile-username"
              type="text"
              bind:value={profileUsername}
              placeholder="admin"
              required
            />
          </div>

          <div class="form-group">
            <label for="profile-password">New Password (optional)</label>
            <input
              id="profile-password"
              type="password"
              bind:value={profilePassword}
              placeholder="Leave empty to keep current password"
            />
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" on:click={closeProfileModal}>
              Cancel
            </button>
            <button type="submit" class="btn-primary" disabled={isUpdatingProfile}>
              {isUpdatingProfile ? "Updating..." : "Update Profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}



