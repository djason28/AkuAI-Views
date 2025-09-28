<script>
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import "../../lib/styles/global.css";
  import "../../lib/styles/login.css";

  const API_URL = "http://127.0.0.1:5000";

  let email = "";
  let password = "";
  let errorMsg = "";
  let showPassword = false;
  let isDarkMode = true; // Default to dark mode

  // Theme management
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    isDarkMode = theme === 'dark';
  }

  onMount(() => {
    // Load saved theme or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
  });

  async function handleLogin() {
    errorMsg = "";

    // Validasi client-side
    if (!email.trim() || !password.trim()) {
      errorMsg = "Email dan password wajib diisi";
      return;
    }

    // Validasi format email sederhana
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      errorMsg = "Format email tidak valid";
      return;
    }

    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password })
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem("token", data.access_token); // simpan token
      localStorage.setItem("username", data.username); // simpan username
      goto("/"); // redirect ke halaman chat
    } else {
      const err = await res.json();
      errorMsg = err.msg || "Login gagal";
    }
  }
</script>

<div class="login-container">
  <div class="login-box">
    <!-- Theme Toggle -->
    <div class="theme-controls">
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

    <h1>AkuAI</h1>
    <p class="subtitle">Masuk ke akunmu</p>

    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}

    <input
      type="email"
      placeholder="Email"
      bind:value={email}
      on:keydown={(e) => e.key === "Enter" && handleLogin()}
    />
    
    <div class="password-container">
      <input
        type={showPassword ? "text" : "password"}
        placeholder="Password"
        bind:value={password}
        on:keydown={(e) => e.key === "Enter" && handleLogin()}
      />
      <button
        type="button"
        class="toggle-password"
        aria-label={showPassword ? "Hide password" : "Show password"}
        on:click={() => showPassword = !showPassword}
      >
        {#if showPassword}
          <!-- Eye OFF icon -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.22 2.22a.75.75 0 0 1 1.06 0L21.06 20a.75.75 0 1 1-1.06 1.06L17.73 18.8c-1.5.97-3.36 1.7-5.73 1.7-6 0-10.5-6-10.5-6a16.8 16.8 0 0 1 4.37-4.6L2.22 3.28a.75.75 0 0 1 0-1.06zM7.8 6.6l1.83 1.83A3 3 0 0 1 12 8a3 3 0 0 1 2.38.8L16.2 6.6C14.9 5.6 13.5 5 12 5c-1.5 0-2.9.6-4.2 1.6zm8.4 8.4-1.83-1.83A3 3 0 0 1 12 14a3 3 0 0 1-2.38-.8L7.8 15.4C9.1 16.4 10.5 17 12 17c1.5 0 2.9-.6 4.2-1.6zM12 6.5c-3.04 0-5.5 2.46-5.5 5.5 0 .35.03.69.09 1.02L8.4 11.2A3.5 3.5 0 0 1 12 6.5z"/>
          </svg>
        {:else}
          <!-- Eye ON icon -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
          </svg>
        {/if}
      </button>
    </div>

    <button on:click={handleLogin}>Login</button>

    <div class="footer-links">
      <p>Belum punya akun? <a href="/register">Daftar di sini</a></p>
    </div>
  </div>
</div>


