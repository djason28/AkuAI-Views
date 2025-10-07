<script>
  // Image slider modal state
  let sliderOpen = false;
  let sliderIndex = 0;
  import { onMount, afterUpdate, onDestroy, tick } from "svelte";
  import { goto } from "$app/navigation";
  import "../lib/styles/layout.css";
  import "../lib/styles/header.css";
  import "../lib/styles/sidebar.css";
  import "../lib/styles/chat.css";     
  import "../lib/styles/input.css";       
  import "../lib/styles/modal.css";       
  import "../lib/styles/animation.css";  
  import "../lib/styles/responsive.css";
  import "../lib/styles/uib.css";
  import "../lib/styles/images.css"; 
  import { formatBotMessage, formatStreamingBotMessage, formatUserMessage, isSessionComplete, normalizeWhitespace } from "../lib/utils/messageFormatter.js";
  import { authToken, username as usernameStore, handleApiError, clearAuth } from "../lib/stores/auth.js";

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
  let showProfileModal = false;
  let showProfileDropdown = false;
  let profileEmail = "";
  let profileUsername = "";
  let profilePassword = "";
  let profileError = "";
  let profileSuccess = "";
  let isUpdatingProfile = false;
  let showProfilePassword = false;
  let profileImageURL = "";
  let hasProfileImage = false;
  let isUploadingImage = false;
  let uploadProgress = 0;
  let imagePreviewURL = "";
  let selectedImageFile = null;
  let inputMessageElement;
  let passwordFieldFocused = false;
  let isStreaming = false;
  let isUIBContext = false;
  let uibIndicatorVisible = false;
  let streamAbortController = null;
  let stopRequested = false;          
  let nextSendBypassDuplicate = false; 
  let runSeq = 0;
  let lastStoppedRunSeq = -1;
  let requestImages = false;
  let searchingImages = false;
  let currentImages = [];
  let imageSearchInfo = null;
  let conversationImages = {}; // Store images per conversation
  let conversationImageMeta = {}; // Store image metadata per conversation
  
  let sessionCompleted = false;
  let showDoneIndicator = false;
  let autoReloadTimer = null;
  let showLoadingDots = false;
  let messagesRenderKey = 0;
  let showQuickChatDropdown = false;
  let quickChatItems = [
    "Apa saja sertifikasi UIB bulan Oktober 2025?",
    "Webinar apa saja yang diadakan UIB November 2025?",
    "Bagaimana cara daftar acara UIB Desember?",
    "Jelaskan tentang universitas Universitas Internasional Batam",
    "Berikan informasi jurusan yang ada di UIB", 
    "Bagaimana cara jurusan yang tepat?",
    "Apa saja persyaratan masuk Universitas Internasional Batam?",
    "Ceritakan tentang biaya kuliah di Universitas Internasional Batam",
    "Rekomendasikan beasiswa terbaru dan syaratnya"
  ];

  $: filteredConversations = conversations;

  async function apiCall(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      handleApiError(response);
      return null;
    }

    return response;
  }

  async function loadConversations(query = "") {
    if (!token) return;
    let url = `${API_URL}/conversations`;
    if (query.trim()) {
      url += `?q=${encodeURIComponent(query.trim())}`;
    }
    
    const wasSearchFocused = searchInputElement && document.activeElement === searchInputElement;
    
    isSearching = true;
    const res = await apiCall(url);
    if (res && res.ok) {
      conversations = await res.json();
    }
    isSearching = false;
    
    if (wasSearchFocused && query.trim() && searchInputElement) {
      setTimeout(() => {
        searchInputElement.focus();
      }, 10);
    }
  }

  function handleSearch() {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(async () => {
      await loadConversations(searchQuery);
      if (searchQuery.trim() && searchInputElement) {
        setTimeout(() => {
          searchInputElement.focus();
        }, 10);
      }
    }, 300);
  }

  let isInitialized = false;
  $: if (isInitialized && token && searchQuery !== null) {
    handleSearch();
  }

  function highlightSearchTerm(text, term) {
    if (!term || !text) return text;
    
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  let searchInputElement;

  let isComposing = false;

  function handleTextareaKeydown(event) {
    if (event.key !== 'Enter') return;

    if (event.shiftKey) {
      const currentLines = (inputMessage.match(/\n/g) || []).length + 1;
      const maxLines = 5;
      if (currentLines >= maxLines) {
        event.preventDefault();
      }
      setTimeout(() => {
        autoResizeTextarea();
        if (inputMessageElement) {
          inputMessageElement.scrollTop = inputMessageElement.scrollHeight;
        }
        updateFooterOffset();
      }, 0);
      return;
    }

    if (!isComposing) {
      event.preventDefault();
      if (isStreaming) {
        stopStreaming();
      } else {
        sendMessage();
      }
    }
  }

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

  let chatInputElement;
  function updateFooterOffset() {
    try {
      const h = chatInputElement?.getBoundingClientRect().height || 112;
      document.documentElement.style.setProperty('--footer-offset', (h + 20) + 'px');
    } catch (_) {}
  }

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

  function handleClickOutside(event) {
    if (showQuickChatDropdown && !event.target.closest('.quick-chat-toggle') && !event.target.closest('.quick-chat-dropdown')) {
      showQuickChatDropdown = false;
    }
  }

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
    const res = await apiCall(`${API_URL}/conversations/${conversationId}`);
    if (res && res.ok) {
        const data = await res.json();
        currentConversation = conversationId;
        messages = data.messages.map((msg) => {
          if (!msg || typeof msg !== 'object') return msg;
          const base = { ...msg };
          if (typeof base.text === 'string') {
            base.text = normalizeWhitespace(base.text);
          }
          if (base.sender === 'bot') {
            base._preFormattedHTML = formatBotMessage(base.text || '');
            base._formatted = true;
            base.isStreaming = false;
          }
          return base;
        });
        messagesRenderKey += 1;
        
  // Load images for this conversation
  currentImages = conversationImages[conversationId] || [];
  imageSearchInfo = conversationImageMeta[conversationId] || null;
  searchingImages = false;
        
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
    showDoneIndicator = false;
    sessionCompleted = false;
    currentImages = [];
    searchingImages = false;
    imageSearchInfo = null;
    if (autoReloadTimer) {
      clearTimeout(autoReloadTimer);
      autoReloadTimer = null;
    }
  }

  function toggleRequestImages() {
    requestImages = !requestImages;
    if (!requestImages) {
      searchingImages = false;
      if (!currentImages || currentImages.length === 0) {
        imageSearchInfo = null;
      }
    }
  }

  // Function to detect UIB-related messages
  function detectUIBContext(message) {
    const uibKeywords = [
      'uib', 'universitas internasional batam', 'batam',
      'sertifikasi uib', 'webinar uib', 'acara uib',
      'oktober uib', 'november uib', 'desember uib',
      'pendaftaran uib', 'event uib', 'kegiatan uib'
    ];
    
    const messageLower = message.toLowerCase();
    return uibKeywords.some(keyword => messageLower.includes(keyword));
  }

  function stopStreaming() {
    if (streamAbortController) {
      console.log("🛑 Stop streaming requested by user");
      lastStoppedRunSeq = runSeq; // Set this before aborting
      streamAbortController.abort();
      streamAbortController = null;
      nextSendBypassDuplicate = true; // Allow bypassing duplicate check for next send
    }
    isStreaming = false;
    stopRequested = true;
  }

  async function sendMessage() {
    const text = inputMessage.trim();
    if (!text || isStreaming) return;

    imageSearchInfo = null;

    // Check if message is UIB-related
    isUIBContext = detectUIBContext(text);
    if (isUIBContext) {
      uibIndicatorVisible = true;
      setTimeout(() => {
        uibIndicatorVisible = false;
      }, 5000); // Hide indicator after 5 seconds
    }

    messages = [...messages, { sender: "user", text, isUIBContext }];
    inputMessage = "";
    
    // Reset image states for new requests
    if (requestImages) {
      currentImages = [];
      searchingImages = true;
      if (currentConversation) {
        conversationImages[currentConversation] = [];
        conversationImageMeta[currentConversation] = null;
      }
    } else {
      currentImages = [];
      imageSearchInfo = null;
      searchingImages = false;
    }
    
    if (inputMessageElement) {
      inputMessageElement.style.height = 'auto';
    }

    const payload = {
      message: text,
      conversation_id: currentConversation || null,
      request_images: requestImages
    };

  isStreaming = true;
  stopRequested = false;
  const myRunSeq = ++runSeq;
  showLoadingDots = true;
    showDoneIndicator = false;
    if (autoReloadTimer) {
      clearTimeout(autoReloadTimer);
      autoReloadTimer = null;
    }
    streamAbortController = new AbortController();
    let botIndex = -1; 
    let decoder = new TextDecoder();
    let buffer = "";   
    let pendingText = "";    
    let paceTimer = null;    
    let paceDone = false;   
    let firstEmit = false;  
    let scheduleCount = 0;  

    function scheduleNextTick() {
      if (paceTimer) return;
      if (scheduleCount > 1000) {
        console.warn("Too many schedule attempts, stopping");
        paceDone = true;
        return;
      }
      scheduleCount++;
      
  const delay = firstEmit ? 140 + Math.floor(Math.random() * 120) : 35;
      paceTimer = setTimeout(() => {
        paceTimer = null;
        if (stopRequested) {
          pendingText = "";
          paceDone = true;
        }
        if (pendingText.length === 0) {
          if (paceDone) {
            console.log("Stream completed, schedule count:", scheduleCount);
            return;
          }

          if (scheduleCount < 50) {
            scheduleNextTick();
          }
          return;
        }

        let baseSize;
        if (pendingText.length > 600) {
          baseSize = firstEmit ? 48 + Math.floor(Math.random() * 20) : 30 + Math.floor(Math.random() * 12);
        } else if (pendingText.length > 250) {
          baseSize = firstEmit ? 34 + Math.floor(Math.random() * 16) : 24 + Math.floor(Math.random() * 10);
        } else {
          baseSize = firstEmit ? 24 + Math.floor(Math.random() * 10) : 18 + Math.floor(Math.random() * 8);
        }
        let emitEnd = Math.min(baseSize, pendingText.length);
        const maxLookAhead = 12;
        const maxLookBack = 10;
        if (emitEnd < pendingText.length) {
          let i = emitEnd;
          while (i < pendingText.length && i < emitEnd + maxLookAhead && !/[\s,.;:!?\)]/.test(pendingText[i])) i++;
          if (i < pendingText.length && /[\s,.;:!?\)]/.test(pendingText[i])) {
            emitEnd = i + 1;
          } else {
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
          showLoadingDots = false; 
        } else {
          const updated = [...messages];
          const newText = (updated[botIndex].text || "") + emit;
          updated[botIndex] = { ...updated[botIndex], text: newText, isStreaming: true };
          messages = updated;
        }
        firstEmit = true;

        if (pendingText.length > 0 || !paceDone) {
          scheduleNextTick();
        } else {
          if (botIndex >= 0 && messages[botIndex]) {
            const updated = [...messages];
            const finalText = normalizeWhitespace(updated[botIndex].text || "");
            updated[botIndex] = { 
              ...updated[botIndex], 
              text: finalText,
              isStreaming: false,
              _preFormattedHTML: formatBotMessage(finalText),
              _formatted: true
            };
            messages = updated;
          }
          console.log("✅ Streaming completely finished, reverting button to Send");
          isStreaming = false;
          setTimeout(() => {
            showDoneIndicator = false;
          }, 800);
        }
      }, delay);
    }

    const streamTimeout = setTimeout(() => {
      if (streamAbortController) {
        console.log("Stream timeout - aborting");
        streamAbortController.abort();
      }
    }, 60000); 

    let completedNormally = false; 
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

      if (res.status === 401) {
        clearTimeout(streamTimeout);
        handleApiError(res);
        return;
      }

      if (!res.ok || !res.body) {
        clearTimeout(streamTimeout);
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

  const reader = res.body.getReader();
      let chunkCount = 0;
      let lastChunkTime = Date.now();
  let shouldClose = false; 
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          clearTimeout(streamTimeout);
          break;
        }
        
        chunkCount++;
        lastChunkTime = Date.now();
        buffer += decoder.decode(value, { stream: true });
        
        if (chunkCount % 10 === 0) {
          console.log(`Processed ${chunkCount} chunks, buffer size: ${buffer.length}`);
        }

        let parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const lines = part.split(/\r?\n/);
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              event = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              data += line.slice(5);
            }
          }

          if (event === "user_saved") {
            try {
              const obj = JSON.parse(data);
              if (obj && obj.conversation_id) {
                currentConversation = obj.conversation_id;
                loadConversations(searchQuery);
              }
            } catch (_) {}
          } else if (event === "delta") {
            const chunk = data.replace(/\\n/g, "\n");
            pendingText += chunk;
            scheduleNextTick();
          } else if (event === "images_searching") {
            try {
              const obj = JSON.parse(data || '{}');
              const query = obj.query || '';
              const detected = obj.detected_university || '';
              const message = obj.message || (query ? `Mencari gambar ${query}...` : "Mencari gambar yang relevan...");
              imageSearchInfo = {
                status: "searching",
                message,
                query,
                primaryQuery: obj.query || query,
                detectedUniversity: detected,
                fallback: false,
                error: ""
              };
              searchingImages = true;
              console.log("🔍 Mencari gambar...", imageSearchInfo);
            } catch (e) {
              console.error("Error parsing images_searching payload:", e);
              imageSearchInfo = {
                status: "searching",
                message: "Mencari gambar yang relevan...",
                query: "",
                primaryQuery: "",
                detectedUniversity: "",
                fallback: false,
                error: ""
              };
              searchingImages = true;
            }
          } else if (event === "images_found") {
            try {
              const obj = JSON.parse(data);
              if (obj && obj.images) {
                currentImages = obj.images;
                const meta = {
                  status: "found",
                  message: `Gambar untuk ${obj.query || obj.primary_query || "kampus"} siap ditampilkan`,
                  query: obj.query || obj.primary_query || "",
                  primaryQuery: obj.primary_query || obj.query || "",
                  detectedUniversity: obj.detected_university || "",
                  fallback: Boolean(obj.fallback),
                  error: ""
                };
                imageSearchInfo = meta;

                if (currentConversation) {
                  conversationImages[currentConversation] = obj.images;
                  conversationImageMeta[currentConversation] = { ...meta };
                }

                searchingImages = false;
                console.log(`📸 Ditemukan ${obj.count ?? obj.images.length} gambar:`, obj.images);

                setTimeout(() => {
                  if (chatContainer) {
                    chatContainer.scrollTo({
                      top: chatContainer.scrollHeight,
                      behavior: 'smooth'
                    });
                  }
                }, 300);
              }
            } catch (e) {
              console.error("Error parsing images data:", e);
              searchingImages = false;
            }
          } else if (event === "images_empty") {
            try {
              const obj = JSON.parse(data || '{}');
              const meta = {
                status: "empty",
                message: obj.message || `Tidak ada gambar ditemukan untuk ${obj.query || obj.primary_query || "kampus"}`,
                query: obj.query || obj.primary_query || "",
                primaryQuery: obj.primary_query || obj.query || "",
                detectedUniversity: obj.detected_university || "",
                fallback: Boolean(obj.fallback),
                error: ""
              };
              imageSearchInfo = meta;
              if (currentConversation) {
                conversationImages[currentConversation] = [];
                conversationImageMeta[currentConversation] = { ...meta };
              }
            } catch (e) {
              console.error("Error parsing images_empty payload:", e);
              imageSearchInfo = {
                status: "empty",
                message: "Tidak ada gambar ditemukan",
                query: "",
                primaryQuery: "",
                detectedUniversity: "",
                fallback: false,
                error: ""
              };
            }
            currentImages = [];
            searchingImages = false;
            console.log("📸 Tidak ada gambar ditemukan");
          } else if (event === "images_error") {
            try {
              const obj = JSON.parse(data || '{}');
              console.error("📸 Error mencari gambar:", obj.error);
              const meta = {
                status: "error",
                message: obj.error || "Gagal mencari gambar",
                query: obj.query || obj.primary_query || "",
                primaryQuery: obj.primary_query || obj.query || "",
                detectedUniversity: obj.detected_university || "",
                fallback: Boolean(obj.fallback),
                error: obj.error || "Gagal mencari gambar"
              };
              imageSearchInfo = meta;
              if (currentConversation) {
                conversationImages[currentConversation] = [];
                conversationImageMeta[currentConversation] = { ...meta };
              }
            } catch (e) {
              console.error("📸 Error mencari gambar (unknown)");
              imageSearchInfo = {
                status: "error",
                message: "Gagal mencari gambar",
                query: "",
                primaryQuery: "",
                detectedUniversity: "",
                fallback: false,
                error: "Gagal mencari gambar"
              };
            }
            searchingImages = false;
            currentImages = [];
          } else if (event === "images_disabled") {
            try {
              const obj = JSON.parse(data || '{}');
              imageSearchInfo = {
                status: "disabled",
                message: obj.message || "Fitur gambar belum dikonfigurasi",
                query: obj.query || "",
                primaryQuery: obj.query || "",
                detectedUniversity: "",
                fallback: false,
                error: obj.message || ""
              };
            } catch (e) {
              imageSearchInfo = {
                status: "disabled",
                message: "Fitur gambar belum dikonfigurasi",
                query: "",
                primaryQuery: "",
                detectedUniversity: "",
                fallback: false,
                error: ""
              };
            }
            console.log("📸 Fitur gambar belum dikonfigurasi");
            searchingImages = false;
            currentImages = [];
          } else if (event === "done") {
            console.log("🎯 DONE event received; finishing pacing...");
            paceDone = true;
            showLoadingDots = false;
            searchingImages = false; // Reset image search state
            if (pendingText.length > 0 && !paceTimer) {
              scheduleNextTick();
            }
            shouldClose = true;
            completedNormally = true;
            try { await reader.cancel(); } catch (_) {}
          }
        }
        if (shouldClose) {
          clearTimeout(streamTimeout);
          break;
        }
      }
    } catch (err) {
      const wasManuallyStopped = lastStoppedRunSeq === myRunSeq;
      const isAbortError = err && err.name === 'AbortError';
      if (!(wasManuallyStopped && isAbortError)) {
        console.error("Stream error:", err);
      }

      if (myRunSeq === runSeq) { showLoadingDots = false; }
      clearTimeout(streamTimeout);
      
      let errorMessage = "";
      if (err && err.name === 'AbortError') {
        if (completedNormally) {
          console.log("🟡 Stream cancelled normally after completion");
        } else {
          errorMessage = "Stream dibatalkan atau timeout.";
        }
      } else if (err && err.message && err.message.includes('HTTP')) {
        errorMessage = `Server error: ${err.message}`;
      } else {
        errorMessage = "Maaf, terjadi kesalahan saat streaming.";
      }
      
      const isStale = myRunSeq !== runSeq; 
      if (errorMessage && !wasManuallyStopped && !isStale) {
        messages = [...messages, { sender: "bot", text: errorMessage, _k: Date.now() }];
      }
    } finally {
      if (myRunSeq === runSeq) {
        showLoadingDots = false;
        streamAbortController = null;
      }
      clearTimeout(streamTimeout);
      console.log("Stream cleanup completed, total schedules:", scheduleCount);
      if (!stopRequested && pendingText.length > 0 && !paceTimer) {
        scheduleNextTick();
      }
      if (autoReloadTimer) { clearTimeout(autoReloadTimer); autoReloadTimer = null; }

      loadConversations(searchQuery);

      if (myRunSeq === runSeq && (stopRequested || (pendingText.length === 0 && paceDone))) {
        console.log("🔄 WebSocket cleanup: Setting isStreaming = false", { 
          stopRequested, 
          pendingTextLength: pendingText.length, 
          paceDone 
        });
        isStreaming = false;
      } else if (myRunSeq === runSeq) {
        console.log("⏳ WebSocket cleanup: Keeping stop button active", { 
          pendingTextLength: pendingText.length, 
          paceDone, 
          stopRequested 
        });
      }
    }
  }


async function deleteConversation(conversationId) {
    const res = await fetch(`${API_URL}/conversations/${conversationId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      conversations = conversations.filter(c => c.id !== conversationId);
      if (currentConversation === conversationId) {
        currentConversation = null;
        messages = [];
      }
    } else {
      console.error("Gagal delete:", await res.text());
    }
  }

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

  async function logout() {
    try {
      const res = await apiCall(`${API_URL}/logout`, {
        method: "POST"
      });
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      clearAuth();
      goto("/login");
    }
  }

  let modalElement;
  let previouslyFocused;

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

  async function loadProfileData() {
    if (!token) return;
    
    try {
      const res = await fetch(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        profileEmail = data.email;
        profileUsername = data.username;
        profileImageURL = data.profile_image_url || "";
        hasProfileImage = data.has_profile_image || false;
      }
    } catch (error) {
      console.error("Gagal memuat profile data:", error);
    }
  }

  function toggleProfileDropdown() {
    showProfileDropdown = !showProfileDropdown;
  }

  function closeProfileDropdown() {
    showProfileDropdown = false;
  }

  async function openProfileModal() {
    previouslyFocused = document.activeElement;
    
  showProfileModal = true;
  try { document.documentElement.style.overflow = 'hidden'; } catch (_) {}
    profileError = "";
    profileSuccess = "";
    
    try {
      const res = await fetch(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        profileEmail = data.email;
        profileUsername = data.username;
        profilePassword = "";
        profileImageURL = data.profile_image_url || "";
        hasProfileImage = data.has_profile_image || false;
      } else {
        profileError = "Gagal memuat data profil";
      }
    } catch (error) {
      profileError = "Terjadi kesalahan saat memuat profil";
    }

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
    
    imagePreviewURL = "";
    selectedImageFile = null;
    isUploadingImage = false;
    uploadProgress = 0;

    try { document.documentElement.style.overflow = ''; } catch (_) {}

    if (previouslyFocused) {
      previouslyFocused.focus();
    }
  }

  async function updateProfile() {
    if (isUpdatingProfile) return;
    
    profileError = "";
    profileSuccess = "";
    
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
        username = profileUsername.trim(); 
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

  function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      profileError = "Format file tidak didukung. Gunakan JPG, PNG, GIF, atau WEBP.";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      profileError = "Ukuran file terlalu besar. Maksimal 5MB.";
      return;
    }

    selectedImageFile = file;
    profileError = "";

    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreviewURL = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function uploadProfileImage() {
    if (!selectedImageFile || isUploadingImage) return;

    isUploadingImage = true;
    uploadProgress = 0;
    profileError = "";

    try {
      const fileName = selectedImageFile.name;
      const fileExtension = '.' + fileName.split('.').pop().toLowerCase();
      const tokenRes = await fetch(`${API_URL}/profile/image/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ file_extension: fileExtension })
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.msg || "Gagal mendapatkan token upload");
      }

      const tokenData = await tokenRes.json();
      uploadProgress = 30;

      const formData = new FormData();
      formData.append('image', selectedImageFile);
      formData.append('upload_token', tokenData.upload_token);

      const uploadRes = await fetch(`${API_URL}/profile/image/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.msg || "Gagal mengupload gambar");
      }

      const uploadData = await uploadRes.json();
      uploadProgress = 100;
      profileImageURL = uploadData.image_url;
      hasProfileImage = true;
      profileSuccess = "Foto profil berhasil diperbarui";
      selectedImageFile = null;
      imagePreviewURL = "";

      setTimeout(() => {
        profileSuccess = "";
        uploadProgress = 0;
      }, 3000);

    } catch (error) {
      profileError = error.message;
      uploadProgress = 0;
    } finally {
      isUploadingImage = false;
    }
  }

  async function deleteProfileImage() {
    if (!hasProfileImage) return;

    const confirmDelete = confirm("Hapus foto profil?");
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${API_URL}/profile/image`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.ok) {
        profileImageURL = "";
        hasProfileImage = false;
        profileSuccess = "Foto profil berhasil dihapus";
        
        setTimeout(() => {
          profileSuccess = "";
        }, 3000);
      } else {
        const err = await res.json();
        profileError = err.msg || "Gagal menghapus foto profil";
      }
    } catch (error) {
      profileError = "Terjadi kesalahan saat menghapus foto profil";
    }
  }

  function cancelImageUpload() {
    selectedImageFile = null;
    imagePreviewURL = "";
    isUploadingImage = false;
    uploadProgress = 0;
    profileError = "";
  }

  async function deleteAllHistory() {
    if (!token) return;
    const confirmDelete = confirm("Hapus semua riwayat percakapan? Tindakan ini tidak bisa dibatalkan.");
    if (!confirmDelete) return;
    try {
      const res = await apiCall(`${API_URL}/conversations`, {
        method: "DELETE"
      });
      if (res && res.ok) {
        conversations = [];
        currentConversation = null;
        messages = [];
        profileSuccess = "Semua riwayat percakapan berhasil dihapus.";
        setTimeout(() => { profileSuccess = ""; }, 2000);
      } else if (res) {
        const err = await res.json().catch(() => ({}));
        profileError = err.msg || "Gagal menghapus semua riwayat.";
      }
    } catch (e) {
      profileError = "Terjadi kesalahan jaringan.";
    }
  }

  function selectQuickChat(message) {
    inputMessage = message;
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
    
    username = localStorage.getItem("username") || "User";
    authToken.set(token);
    usernameStore.set(username);
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
    
    loadConversations();
    loadProfileData(); 
    isInitialized = true; 
    setTimeout(updateFooterOffset, 0);
    let ro;
    try {
      ro = new ResizeObserver(() => updateFooterOffset());
      if (chatInputElement) ro.observe(chatInputElement);
    } catch (_) {}
  window.addEventListener('resize', updateFooterOffset);
    
    // Close dropdown when clicking outside
    const handleClickOutside = (event) => {
      if (showProfileDropdown && !event.target.closest('.profile-dropdown-container')) {
        closeProfileDropdown();
      }
    };
    document.addEventListener('click', handleClickOutside);
    
    return () => {
  // removed handleKeydown global listener cleanup
      document.removeEventListener('click', handleClickOutside);
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

  function portal(node) {
    const target = document.body;
    target.appendChild(node);
    return {
      destroy() {
        if (node && node.parentNode === target) target.removeChild(node);
      }
    };
  }

  afterUpdate(() => {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  });
</script>



<div class="app" class:blurred={showProfileModal}>
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
  <aside class="sidebar" class:collapsed={isSidebarCollapsed}>
    <div class="sidebar-header">
      <div class="profile-section">
        <div class="profile-dropdown-container">
          <button class="profile-button" on:click={toggleProfileDropdown} aria-label="Profile Menu">
            <div class="profile-avatar">
              {#if hasProfileImage && profileImageURL}
                <img 
                  src={profileImageURL} 
                  alt="Your profile" 
                  class="profile-avatar-img"
                />
              {:else}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              {/if}
            </div>
            <div class="profile-info">
              <div class="profile-name">{username}</div>
            </div>
            <div class="dropdown-arrow" class:rotated={showProfileDropdown}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
              </svg>
            </div>
          </button>
          
          {#if showProfileDropdown}
            <div class="profile-dropdown">
              <button class="dropdown-item" on:click={() => { openProfileModal(); closeProfileDropdown(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708L12.854.146zm.646 4.24L11.207 6.68l3.713 3.713L16.213 8.1 13.5 4.386zM10.5 7.387L4.387 13.5H6v1a.5.5 0 0 0 .5.5h1v1.5a.5.5 0 0 0 .5.5h1v1.5a.5.5 0 0 0 .5.5h1v1h-4A1.5 1.5 0 0 1 4 17.5v-13A1.5 1.5 0 0 1 5.5 3h5.793L10.5 7.387z"/>
                </svg>
                Edit Profile
              </button>
              <button class="dropdown-item logout-item" on:click={() => { logout(); closeProfileDropdown(); }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
                  <path d="m15.854 8.354-3-3a.5.5 0 0 0-.708.708L14.293 8H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708z"/>
                </svg>
                Logout
              </button>
            </div>
          {/if}
        </div>
      </div>
      <button class="new-chat" on:click={newConversation}>New Chat</button>
      
      <div class="search-container">
        <div class="search-input-wrapper">
          {#if isSearching}
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
              if (searchInputElement && document.activeElement !== searchInputElement) {
                searchInputElement.focus();
              }
            }}
          />
          {#if searchQuery && !isSearching}
            <button class="search-clear" aria-label="Clear search" on:click={() => {
              searchQuery = "";
              loadConversations(); 
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
               class:nuclear={msg._nuclear}
               class:uib-context={msg.isUIBContext}>
            

            
            {#if msg.sender === 'bot'}
              {#if msg.isStreaming}
                {@html formatStreamingBotMessage(msg.text)}
              {:else if msg._nuclear && msg._preFormattedHTML}
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
        {/each}    
        
        <!-- Image Search Results -->
        {#if imageSearchInfo && imageSearchInfo.status !== 'found'}
          <div class={`image-search-status status-${imageSearchInfo.status}`}>
            {#if imageSearchInfo.status === 'searching'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
            {:else if imageSearchInfo.status === 'error'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            {:else}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
            {/if}
            <div class="image-search-status-text">
              <div class="image-search-message">{imageSearchInfo.message}</div>
              {#if imageSearchInfo.query || imageSearchInfo.fallback}
                <div class="image-search-meta">
                  {#if imageSearchInfo.query}
                    <span>Kueri: "{imageSearchInfo.query}"</span>
                  {/if}
                  {#if imageSearchInfo.fallback}
                    <span>Menggunakan pencarian umum</span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}
        
        {#if currentImages && currentImages.length > 0}
          <div class="image-gallery">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21,15 16,10 5,21"/>
              </svg>
              {#if imageSearchInfo && imageSearchInfo.query}
                Gambar {imageSearchInfo.query} ({currentImages.length})
              {:else}
                Gambar Terkait ({currentImages.length})
              {/if}
            </h4>
            <div class="image-grid">
              {#each currentImages as image, idx}
                <div class="image-item">
                  <img 
                    src={image.thumbnail_url || image.image_url} 
                    alt={image.title}
                    loading="lazy"
                    on:error={(e) => {
                      // Fallback to main image if thumbnail fails
                      if (e.target.src !== image.image_url) {
                        e.target.src = image.image_url;
                      } else {
                        e.target.style.display = 'none';
                        e.target.nextElementSibling.style.display = 'flex';
                      }
                    }}
                  />
                  <div class="image-overlay">
                    <div class="image-title">{image.title}</div>
                    <a href={image.source_url} 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       class="image-source">
                      Lihat sumber →
                    </a>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
        
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



  <footer class="chat-input" bind:this={chatInputElement}>
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
        class="image-toggle-btn" 
        class:active={requestImages}
        on:click={toggleRequestImages}
        aria-label="Toggle pencarian gambar"
        title={requestImages ? "Matikan pencarian gambar" : "Nyalakan pencarian gambar"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21,15 16,10 5,21"/>
        </svg>
      </button>
      
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
      style="position: relative !important; width: 60vw !important; max-width: 1000px !important; max-height: 90vh !important; background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%) !important; border: 2px solid rgba(148,163,184,0.25) !important; border-radius: 16px !important; box-shadow: 0 25px 50px rgba(0,0,0,0.25), 0 8px 32px rgba(0,0,0,0.12) !important; z-index: 1 !important; display: flex !important; flex-direction: column !important; overflow: hidden !important;"
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

      <div class="modal-content" style="padding: 24px 32px 28px 32px; background: rgba(5,15,30,0.6); border-radius: 0 0 16px 16px; overflow-y: auto !important; flex: 1 !important;">
        {#if profileError}
          <div class="error-message">{profileError}</div>
        {/if}
        {#if profileSuccess}
          <div class="success-message">{profileSuccess}</div>
        {/if}

        <div class="profile-image-section" style="margin-bottom: 24px; text-align: center;">
          <h3 style="margin: 0 0 16px 0; font-size: 1.1rem; color: #e2e8f0;">Profile Picture</h3>
          
          <div class="image-preview-container" style="margin-bottom: 16px;">
            {#if imagePreviewURL}
              <img 
                src={imagePreviewURL} 
                alt="Selected for upload" 
                style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #8b5cf6;"
              />
            {:else if hasProfileImage && profileImageURL}
              <img 
                src={profileImageURL} 
                alt="Your profile avatar" 
                style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #64748b;"
              />
            {:else}
              <div 
                style="width: 120px; height: 120px; border-radius: 50%; background: linear-gradient(135deg, #64748b 0%, #475569 100%); display: flex; align-items: center; justify-content: center; margin: 0 auto; border: 3px solid #475569;"
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" style="color: #94a3b8;">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
            {/if}
          </div>

          {#if !selectedImageFile}
            <div class="upload-buttons">
              <label class="profile-btn profile-btn-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                Choose Image
                <input 
                  type="file" 
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" 
                  on:change={handleImageSelect}
                  class="file-input"
                />
              </label>
              
              {#if hasProfileImage}
                <button 
                  type="button" 
                  class="profile-btn profile-btn-danger" 
                  on:click={deleteProfileImage}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  </svg>
                  Delete
                </button>
              {/if}
            </div>
          {:else}
            <div class="upload-actions">
              <button 
                type="button" 
                class="profile-btn profile-btn-success" 
                on:click={uploadProfileImage}
                disabled={isUploadingImage}
              >
                {#if isUploadingImage}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                  Uploading...
                {:else}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  Upload
                {/if}
              </button>
              
              <button 
                type="button" 
                class="profile-btn profile-btn-secondary" 
                on:click={cancelImageUpload}
                disabled={isUploadingImage}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
                Cancel
              </button>
            </div>
            
            {#if isUploadingImage && uploadProgress > 0}
              <div class="upload-progress" style="margin-top: 16px;">
                <div style="width: 100%; background: rgba(148,163,184,0.2); border-radius: 8px; height: 8px; overflow: hidden;">
                  <div 
                    style="height: 100%; background: linear-gradient(90deg, #8b5cf6 0%, #a855f7 100%); transition: width 0.3s; width: {uploadProgress}%;"
                  ></div>
                </div>
                <p style="margin: 8px 0 0 0; font-size: 0.9rem; color: #94a3b8; text-align: center;">{uploadProgress}%</p>
              </div>
            {/if}
          {/if}
        </div>

        <form on:submit|preventDefault={updateProfile}>
          <div class="form-group">
            <input
              id="profile-name"
              type="text"
              name="name"
              autocomplete="name"
              bind:value={profileUsername}
              required
            />
            <label 
              for="profile-name"
              class:filled={profileUsername}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              Name
            </label>
          </div>

          <div class="form-group">
            <input
              id="profile-email"
              type="email"
              name="email"
              autocomplete="email"
              bind:value={profileEmail}
              required
            />
            <label 
              for="profile-email"
              class:filled={profileEmail}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
              Email Address
            </label>
          </div>

          <div class="form-group password-group">
            <div class="password-container">
              <input
                id="profile-password"
                type={showProfilePassword ? "text" : "password"}
                name="new-password"
                autocomplete="new-password"
                bind:value={profilePassword}
                placeholder="Enter new password"
                on:focus={() => passwordFieldFocused = true}
                on:blur={() => passwordFieldFocused = false}
              />
              <button
                type="button"
                class="toggle-password"
                on:click={() => showProfilePassword = !showProfilePassword}
                aria-label={showProfilePassword ? "Hide password" : "Show password"}
              >
                {#if showProfilePassword}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.22 2.22a.75.75 0 0 1 1.06 0L21.06 20a.75.75 0 1 1-1.06 1.06L17.73 18.8c-1.5.97-3.36 1.7-5.73 1.7-6 0-10.5-6-10.5-6a16.8 16.8 0 0 1 4.37-4.6L2.22 3.28a.75.75 0 0 1 0-1.06zM7.8 6.6l1.83 1.83A3 3 0 0 1 12 8a3 3 0 0 1 2.38.8L16.2 6.6C14.9 5.6 13.5 5 12 5c-1.5 0-2.9.6-4.2 1.6zm8.4 8.4-1.83-1.83A3 3 0 0 1 12 14a3 3 0 0 1-2.38-.8L7.8 15.4C9.1 16.4 10.5 17 12 17c1.5 0 2.9-.6 4.2-1.6zM12 6.5c-3.04 0-5.5 2.46-5.5 5.5 0 .35.03.69.09 1.02L8.4 11.2A3.5 3.5 0 0 1 12 6.5z"/>
                  </svg>
                {:else}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  </svg>
                {/if}
              </button>
            </div>
            <label 
              for="profile-password"
              class="filled"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
                <path d="M18,8h-1V6c0-2.76-2.24-5-5-5S7,3.24,7,6v2H6c-1.1,0-2,0.9-2,2v10c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V10C20,8.9,19.1,8,18,8z M12,17c-1.1,0-2-0.9-2-2s0.9-2,2-2s2,0.9,2,2S13.1,17,12,17z M15.1,8H8.9V6c0-1.71,1.39-3.1,3.1-3.1s3.1,1.39,3.1,3.1V8z"/>
              </svg>
              New Password <span style="color: #94a3b8; font-weight: 400;">(optional)</span>
            </label>
          </div>

          <div class="modal-buttons-row">
            <button 
              type="button" 
              class="btn-danger" 
              on:click={deleteAllHistory}
            >
              Delete All
            </button>
            
            <button 
              type="button" 
              class="btn-cancel" 
              on:click={closeProfileModal}
            >
              Cancel
            </button>
            
            <button 
              type="submit" 
              class="btn-save" 
              disabled={isUpdatingProfile}
            >
              <span class="btn-save-text">
                {isUpdatingProfile ? "Saving..." : "Save Changes"}
              </span>
              <div class="btn-save-shine"></div>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}




<style>
  :global(.form-group) {
    position: relative;
    width: 100%;
    margin-bottom: 1.5rem;
  }
  
  :global(.form-group label) {
    position: absolute;
    left: 18px;
    top: 16px;
    background: var(--input-bg);
    padding: 0 6px;
    color: var(--text-secondary);
    font-size: 15px;
    font-weight: 500;
    pointer-events: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1;
    border-radius: 4px;
    display: flex;
    align-items: center;
  }

  :global(.form-group input:focus + label),
  :global(.form-group label.filled) {
    top: -8px;
    left: 14px;
    font-size: 12px;
    color: var(--primary-color);
    background: var(--background-color);
  }

  :global([data-theme="dark"] .form-group label) {
    background: rgba(30, 41, 59, 0.95);
  }

  :global([data-theme="dark"] .form-group input:focus + label),
  :global([data-theme="dark"] .form-group label.filled) {
    background: var(--background-color);
  }

  :global([data-theme="light"] .form-group label) {
    background: rgba(255, 255, 255, 0.95);
  }

  :global([data-theme="light"] .form-group input:focus + label),
  :global([data-theme="light"] .form-group label.filled) {
    background: var(--background-color);
  }

  :global(.form-group input) {
    width: 100%;
    padding: 16px 18px;
    margin-bottom: 0;
    border: 1px solid var(--border-primary);
    border-radius: 16px;
    background: var(--input-bg);
    color: var(--text-primary);
    font-size: 15px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(10px);
  }

  :global([data-theme="light"] .form-group input) {
    border: 1.5px solid rgba(236, 72, 153, 0.15);
    background: rgba(255, 255, 255, 0.95);
    color: #1f2937;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  }

  :global([data-theme="light"] .form-group input::placeholder) {
    color: #6b7280;
  }

  :global([data-theme="light"] .form-group input:focus) {
    border-color: rgba(236, 72, 153, 0.3);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  :global(.form-group input::placeholder) {
    color: var(--text-placeholder);
  }

  :global(.form-group input:focus) {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px var(--primary-rgba);
    background: var(--input-bg-focus);
  }

  :global(.password-container) {
    position: relative;
    width: 100%;
  }

  :global(.password-group) {
    position: relative;
    width: 100%;
    margin-bottom: 1.5rem;
  }

  :global(.password-container input) {
    width: 100%;
    padding-right: 45px;
    margin-bottom: 0;
  }

  :global(.toggle-password) {
    position: absolute;
    right: 15px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  :global(.toggle-password:hover) {
    color: var(--primary-color);
    background: var(--primary-rgba);
  }
  
  :global([data-theme="light"] .form-group input:focus) {
    border-color: rgba(236,72,153,0.6) !important;
    background: rgba(255,255,255,0.9) !important;
    box-shadow: 0 0 0 3px rgba(236,72,153,0.08), inset 0 1px 0 rgba(148,163,184,0.1), 0 8px 25px rgba(236,72,153,0.1) !important;
    transform: translateY(-1px) !important;
    color: #1f2937 !important;
  }
  
  :global([data-theme="dark"] .form-group input::placeholder),
  :global(.form-group input::placeholder) {
    color: #64748b;
    font-style: italic;
  }
  
  :global([data-theme="light"] .form-group input::placeholder) {
    color: #9ca3af;
    font-style: italic;
  }
  
  :global([data-theme="dark"] .btn-cancel:hover),
  :global(.btn-cancel:hover) {
    background: rgba(148,163,184,0.18) !important;
    color: #f1f5f9 !important;
    border-color: rgba(148,163,184,0.35) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 20px rgba(148,163,184,0.2) !important;
  }
  
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
  
  :global([data-theme="dark"] .modal-content),
  :global(.modal-content) {
    padding: 24px 32px 28px 32px;
  }
  
  :global([data-theme="light"] .modal-content) {
    background: rgba(248,250,252,0.8) !important;
    border-radius: 0 0 16px 16px !important;
    backdrop-filter: blur(10px) !important;
  }
  
  :global([data-theme="dark"] .modal-header),
  :global(.modal-header) {
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
  
  :global([data-theme="light"] .form-group input) {
    background: rgba(255,255,255,0.7) !important;
    border: 2px solid rgba(148,163,184,0.2) !important;
    color: #1f2937 !important;
    backdrop-filter: blur(8px) !important;
  }
  
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

  :global(.upload-buttons) {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  :global(.upload-actions) {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 16px;
  }

  :global(.profile-btn) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: none;
    border-radius: 10px;
    font-weight: 500;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
    text-decoration: none;
    min-width: 110px;
    justify-content: center;
    backdrop-filter: blur(10px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  :global(.profile-btn:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
  }

  :global(.file-input) {
    display: none;
  }

  :global(.profile-btn-primary) {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  :global(.profile-btn-primary:hover:not(:disabled)) {
    background: linear-gradient(135deg, #5855eb 0%, #7c3aed 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
  }

  :global(.profile-btn-primary::before) {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    transition: left 0.6s;
  }

  :global(.profile-btn-primary:hover::before) {
    left: 100%;
  }

  :global(.profile-btn-success) {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  :global(.profile-btn-success:hover:not(:disabled)) {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
  }

  :global(.profile-btn-danger) {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  :global(.profile-btn-danger:hover:not(:disabled)) {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
  }

  :global(.profile-btn-secondary) {
    background: linear-gradient(135deg, #64748b 0%, #475569 100%);
    color: white;
    border: 1px solid rgba(100, 116, 139, 0.3);
  }

  :global(.profile-btn-secondary:hover:not(:disabled)) {
    background: linear-gradient(135deg, #475569 0%, #334155 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(100, 116, 139, 0.4);
  }

  :global([data-theme="light"] .profile-btn-primary) {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border: 1px solid rgba(29, 78, 216, 0.3);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
    color: white;
  }

  :global([data-theme="light"] .profile-btn-primary:hover:not(:disabled)) {
    background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
    box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
    transform: translateY(-2px);
  }

  :global([data-theme="light"] .profile-btn-success) {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    border: 1px solid rgba(5, 150, 105, 0.3);
    box-shadow: 0 2px 8px rgba(5, 150, 105, 0.2);
  }

  :global([data-theme="light"] .profile-btn-success:hover:not(:disabled)) {
    background: linear-gradient(135deg, #047857 0%, #065f46 100%);
    box-shadow: 0 6px 20px rgba(5, 150, 105, 0.3);
  }

  :global([data-theme="light"] .profile-btn-danger) {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    border: 1px solid rgba(220, 38, 38, 0.3);
    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.2);
  }

  :global([data-theme="light"] .profile-btn-danger:hover:not(:disabled)) {
    background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
    box-shadow: 0 6px 20px rgba(220, 38, 38, 0.3);
  }

  :global([data-theme="light"] .profile-btn-secondary) {
    background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
    border: 1px solid rgba(107, 114, 128, 0.3);
    box-shadow: 0 2px 8px rgba(107, 114, 128, 0.2);
  }

  :global([data-theme="light"] .profile-btn-secondary:hover:not(:disabled)) {
    background: linear-gradient(135deg, #4b5563 0%, #374151 100%);
    box-shadow: 0 6px 20px rgba(107, 114, 128, 0.3);
  }

  :global(.btn-danger) {
    background: linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(220,38,38,0.2) 100%);
    color: #fca5a5;
    border: 1px solid rgba(239,68,68,0.4);
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(239,68,68,0.15);
    flex: 1;
    padding: 14px 20px;
  }

  :global(.btn-danger:hover) {
    background: linear-gradient(135deg, rgba(239,68,68,0.25) 0%, rgba(220,38,38,0.3) 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(239,68,68,0.25);
  }

  :global(.btn-cancel) {
    background: rgba(148,163,184,0.12);
    color: #cbd5e1;
    border: 1px solid rgba(148,163,184,0.25);
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.3s ease;
    backdrop-filter: blur(8px);
    flex: 1;
    padding: 14px 20px;
  }

  :global(.btn-cancel:hover) {
    background: rgba(148,163,184,0.2);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(148,163,184,0.2);
  }

  :global(.btn-save) {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
    color: white;
    border: none;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 14px rgba(99,102,241,0.3), inset 0 1px 0 rgba(255,255,255,0.15);
    position: relative;
    overflow: hidden;
    flex: 1;
    padding: 14px 20px;
  }

  :global(.btn-save:hover:not(:disabled)) {
    background: linear-gradient(135deg, #5855eb 0%, #7c3aed 50%, #9333ea 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
  }

  :global(.btn-save:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
  }

  :global([data-theme="light"] .btn-danger) {
    background: linear-gradient(135deg, rgba(220,38,38,0.1) 0%, rgba(185,28,28,0.15) 100%);
    color: #dc2626;
    border: 1px solid rgba(220,38,38,0.3);
    box-shadow: 0 2px 8px rgba(220,38,38,0.1);
  }

  :global([data-theme="light"] .btn-danger:hover) {
    background: linear-gradient(135deg, rgba(220,38,38,0.15) 0%, rgba(185,28,28,0.2) 100%);
    box-shadow: 0 4px 12px rgba(220,38,38,0.2);
  }

  :global([data-theme="light"] .btn-cancel) {
    background: rgba(100,116,139,0.1);
    color: #475569;
    border: 1px solid rgba(100,116,139,0.2);
    box-shadow: 0 2px 8px rgba(100,116,139,0.1);
  }

  :global([data-theme="light"] .btn-cancel:hover) {
    background: rgba(100,116,139,0.15);
    box-shadow: 0 4px 12px rgba(100,116,139,0.15);
  }

  :global([data-theme="light"] .btn-save) {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 50%, #1e40af 100%);
    box-shadow: 0 2px 8px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.2);
  }

  :global([data-theme="light"] .btn-save:hover:not(:disabled)) {
    background: linear-gradient(135deg, #2563eb 0%, #1e40af 50%, #1e3a8a 100%);
    box-shadow: 0 4px 12px rgba(37,99,235,0.3), inset 0 1px 0 rgba(255,255,255,0.25);
  }

  :global(.modal-buttons-row) {
    display: flex;
    gap: 12px;
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid rgba(148,163,184,0.15);
  }

  :global([data-theme="light"] .modal-buttons-row) {
    border-top-color: rgba(226,232,240,0.4);
  }

  :global(.btn-save-text) {
    position: relative;
    z-index: 1;
  }

  :global(.btn-save-shine) {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    transition: left 0.6s;
  }

  :global(.btn-save:hover .btn-save-shine) {
    left: 100%;
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  :global(.profile-avatar-img) {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(148, 163, 184, 0.3);
    transition: all 0.3s ease;
  }

  :global([data-theme="dark"] .profile-avatar-img),
  :global(.profile-avatar-img) {
    border-color: rgba(148, 163, 184, 0.3);
  }

  :global([data-theme="light"] .profile-avatar-img) {
    border-color: rgba(100, 116, 139, 0.4);
  }

  :global(.profile-avatar-btn:hover .profile-avatar-img) {
    border-color: rgba(139, 92, 246, 0.6);
    transform: scale(1.02);
  }

  :global(.modal-content) {
    scrollbar-width: thin;
    scrollbar-color: rgba(139, 92, 246, 0.6) rgba(148, 163, 184, 0.1);
  }

  :global(.modal-content::-webkit-scrollbar) {
    width: 8px;
  }

  :global(.modal-content::-webkit-scrollbar-track) {
    background: rgba(148, 163, 184, 0.1);
    border-radius: 4px;
  }

  :global(.modal-content::-webkit-scrollbar-thumb) {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.6) 0%, rgba(168, 85, 247, 0.6) 100%);
    border-radius: 4px;
    transition: background 0.3s ease;
  }

  :global(.modal-content::-webkit-scrollbar-thumb:hover) {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.8) 0%, rgba(168, 85, 247, 0.8) 100%);
  }

  :global([data-theme="light"] .modal-content) {
    scrollbar-color: rgba(100, 116, 139, 0.6) rgba(226, 232, 240, 0.3);
  }

  :global([data-theme="light"] .modal-content::-webkit-scrollbar-track) {
    background: rgba(226, 232, 240, 0.3);
  }

  :global([data-theme="light"] .modal-content::-webkit-scrollbar-thumb) {
    background: linear-gradient(135deg, rgba(100, 116, 139, 0.6) 0%, rgba(71, 85, 105, 0.6) 100%);
  }

  :global([data-theme="light"] .modal-content::-webkit-scrollbar-thumb:hover) {
    background: linear-gradient(135deg, rgba(100, 116, 139, 0.8) 0%, rgba(71, 85, 105, 0.8) 100%);
  }

  @media (max-width: 480px) {
    :global(.upload-buttons), :global(.upload-actions) {
      flex-direction: column;
      align-items: center;
    }
    
    :global(.profile-btn) {
      width: 100%;
      max-width: 200px;
      min-width: auto;
    }
  }
</style>

<!-- Image Modal -->




