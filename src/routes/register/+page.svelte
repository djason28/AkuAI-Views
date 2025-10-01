<script>
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import "../../lib/styles/global.css";
  import "../../lib/styles/register.css";
  import { setAuth } from "../../lib/stores/auth.js";

  const API_URL = "http://127.0.0.1:5000";

  let email = "";
  let username = "";
  let password = "";
  let confirmPassword = "";
  let errorMsg = "";
  let successMsg = "";
  let showPassword = false;
  let showConfirmPassword = false;
  let isLoading = false;
  let isDarkMode = true;
  let emailFieldFocused = false;
  let usernameFieldFocused = false;
  let passwordFieldFocused = false;
  let confirmPasswordFieldFocused = false; 

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    isDarkMode = theme === 'dark';
  }

  onMount(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
  });

  async function handleRegister() {
    errorMsg = "";
    successMsg = "";

    if (!email.trim() || !username.trim() || !password.trim() || !confirmPassword.trim()) {
      errorMsg = "Email, username, password, dan konfirmasi password wajib diisi";
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      errorMsg = "Format email tidak valid";
      return;
    }

    if (!email.trim().toLowerCase().endsWith('@gmail.com')) {
      errorMsg = "Email harus menggunakan alamat @gmail.com";
      return;
    }

    if (username.trim().length < 3) {
      errorMsg = "Username minimal 3 karakter";
      return;
    }

    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
      errorMsg = "Password harus mengandung minimal 1 huruf dan 1 angka";
      return;
    }

    if (password !== confirmPassword) {
      errorMsg = "Password dan konfirmasi password tidak cocok";
      return;
    }

    isLoading = true;

    try {
      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: email.trim().toLowerCase(),
          username: username.trim(), 
          password: password,
          confirm_password: confirmPassword
        })
      });

      const data = await res.json();

      if (res.ok) {
        successMsg = `Akun ${data.username} berhasil dibuat! Redirecting to login...`;
        setTimeout(() => {
          goto("/login");
        }, 2000);
      } else {
        if (res.status === 409) {
          errorMsg = "Email atau username sudah terdaftar, silakan pilih yang lain";
        } else {
          errorMsg = data.msg || "Registration gagal";
        }
      }
    } catch (error) {
      errorMsg = "Gagal terhubung ke server. Silakan coba lagi.";
      console.error("Register error:", error);
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(event) {
    if (event.key === "Enter" && !isLoading) {
      handleRegister();
    }
  }
</script>

<div class="register-container">
  <div class="register-box">
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
    <p class="subtitle">Buat akun baru</p>

    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}

    {#if successMsg}
      <p class="success">{successMsg}</p>
    {/if}

    <div class="form-group">
      <input
        id="email"
        type="email"
        bind:value={email}
        on:focus={() => emailFieldFocused = true}
        on:blur={() => emailFieldFocused = false}
        on:keydown={handleKeydown}
        disabled={isLoading}
        maxlength="100"
      />
      <label 
        for="email" 
        class:filled={email || emailFieldFocused}
      >Email</label>
    </div>

    <div class="form-group">
      <input
        id="username"
        type="text"
        bind:value={username}
        on:focus={() => usernameFieldFocused = true}
        on:blur={() => usernameFieldFocused = false}
        on:keydown={handleKeydown}
        disabled={isLoading}
        maxlength="50"
      />
      <label 
        for="username" 
        class:filled={username || usernameFieldFocused}
      >Username</label>
    </div>
    
    <div class="form-group password-group">
      <div class="password-container">
        <input
          id="password"
          type={showPassword ? "text" : "password"}
          bind:value={password}
          on:focus={() => passwordFieldFocused = true}
          on:blur={() => passwordFieldFocused = false}
          on:keydown={handleKeydown}
          disabled={isLoading}
        />
        <label 
          for="password" 
          class:filled={password || passwordFieldFocused}
        >Password</label>
        <button
          type="button"
          class="toggle-password"
          on:click={() => showPassword = !showPassword}
          disabled={isLoading}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {#if showPassword}
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
    </div>

    <div class="form-group password-group">
      <div class="password-container">
        <input
          id="confirmPassword"
          type={showConfirmPassword ? "text" : "password"}
          bind:value={confirmPassword}
          on:focus={() => confirmPasswordFieldFocused = true}
          on:blur={() => confirmPasswordFieldFocused = false}
          on:keydown={handleKeydown}
          disabled={isLoading}
        />
        <label 
          for="confirmPassword" 
          class:filled={confirmPassword || confirmPasswordFieldFocused}
        >Konfirmasi Password</label>
        <button
          type="button"
          class="toggle-password"
          on:click={() => showConfirmPassword = !showConfirmPassword}
          disabled={isLoading}
          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
        >
          {#if showConfirmPassword}
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
    </div>

    <button 
      on:click={handleRegister}
      disabled={isLoading}
      class="register-btn"
    >
      {#if isLoading}
        <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="32" stroke-dashoffset="32">
            <animateTransform attributeName="transform" type="rotate" dur="1s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
          </circle>
        </svg>
        Membuat Akun...
      {:else}
        Daftar
      {/if}
    </button>

    <div class="footer-links">
      <p>Sudah punya akun? <a href="/login">Masuk di sini</a></p>
    </div>
  </div>
</div>