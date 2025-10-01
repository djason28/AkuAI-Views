# 🌟 AkuAI Frontend (Views)

Modern AI Chat Frontend built with SvelteKit, featuring real-time chat, profile management, and responsive design with dark/light theme support.

## 🚀 Tech Stack

- **Framework**: SvelteKit 2.0+
- **Language**: JavaScript/TypeScript
- **Styling**: CSS3 with CSS Variables for theming
- **Build Tool**: Vite
- **Real-time**: WebSocket integration
- **Theme**: Dark/Light mode with system preference detection

## 📁 Project Structure

```
src/
├── routes/                 # SvelteKit routes
│   ├── +layout.svelte     # Global layout
│   ├── +page.svelte       # Main chat page
│   ├── login/             # Login page
│   └── register/          # Registration page
├── lib/
│   ├── assets/            # Static assets (favicon, etc.)
│   ├── stores/            # Svelte stores (auth state)
│   ├── styles/            # CSS modules
│   │   ├── global.css     # Global styles & variables
│   │   ├── chat.css       # Chat interface styles
│   │   ├── login.css      # Login page styles
│   │   ├── modal.css      # Modal components
│   │   ├── responsive.css # All responsive breakpoints
│   │   └── ...
│   └── utils/             # Utility functions
└── app.html              # HTML template
```

## 🎨 Features

### 💬 **Chat Interface**
- Real-time AI chat with streaming responses
- Message history and conversation management
- Quick chat suggestions
- Stop/resume message generation
- Responsive design for all devices

### 👤 **User Management**
- User registration and authentication
- Profile management with image upload
- Secure logout functionality

### 🎭 **Theme System**
- Dark/Light mode toggle
- System preference detection
- Persistent theme storage
- CSS variables for consistent theming

### 📱 **Responsive Design**
- Mobile-first approach
- Breakpoints: 360px → 1024px+
- Touch-friendly interface
- Optimized for tablets and phones

## 🛠️ Development

### Prerequisites
- **Node.js 18+** (with npm)
- **Git** (for cloning repository)
- **Backend running** (see `../core/README.md`)

### 📦 Installation & Setup

#### 1. Navigate to Views Directory
```bash
cd views
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Verify Installation
```bash
npm list --depth=0
```

### 🚀 Running the Application

#### Development Mode
```bash
npm run dev

# Server will start at: http://localhost:5173
# The terminal will show:
# ➜ Local: http://localhost:5173/
# ➜ Network: use --host to expose
```

#### Open in Browser
```bash
# Automatically open in default browser
npm run dev -- --open

# Or manually navigate to:
# http://localhost:5173
```

### 🔗 Backend Prerequisites

Before running the frontend, ensure the backend is running:

```bash
# Navigate to core directory
cd ../core

# Make sure backend is running on port 5000
go run main.go
# Should output: Backend running on :5000
```

**Backend must be running at `http://localhost:5000` for the frontend to work properly.**

For backend setup, see `../core/README.md`.

### 🐛 Troubleshooting

#### Node Version Issues
```bash
node --version  # Should be 18+

# Update if needed:
# Download from: https://nodejs.org/
```

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Run Svelte check
npm run check:watch  # Watch mode for Svelte check
```

## 🎯 API Integration

The frontend connects to the Go backend (`../core`) via:
- **REST API**: Authentication, profile, file uploads
- **WebSocket**: Real-time chat streaming
- **Static Files**: Image uploads and assets

### Environment Configuration
```javascript
// Frontend runs on:
const FRONTEND_URL = "http://localhost:5173"

// Backend API configuration:
const API_URL = "http://localhost:5000"
const WS_URL = "ws://localhost:5000/ws/chat"
```

## 📐 CSS Architecture

### Modular CSS Structure
- **global.css**: CSS variables, base styles, themes
- **responsive.css**: All media queries centralized
- **Component-specific**: login.css, chat.css, modal.css
- **Utility**: animation.css, layout.css

### Theme Variables
```css
[data-theme="dark"] {
  --background-color: #0f172a;
  --text-primary: #f1f5f9;
  --primary-color: #8b5cf6;
}

[data-theme="light"] {
  --background-color: #ffffff;
  --text-primary: #1e293b;
  --primary-color: #3b82f6;
}
```

## 🔧 Configuration Files

- **`svelte.config.js`**: SvelteKit configuration
- **`vite.config.js`**: Vite build configuration  
- **`package.json`**: Dependencies and scripts
- **`jsconfig.json`**: JavaScript configuration

## 🚀 Production Build

```bash
# Build for production
npm run build

# Preview production build locally
npm run preview
```

The build outputs to `build/` directory and is ready for deployment to any static hosting service.

## 🔗 Related

- **Backend**: See `../core/README.md` for Go API server
- **Deployment**: Supports Vercel, Netlify, static hosting
- **Documentation**: Component docs in `/src/lib/styles/README.md`
