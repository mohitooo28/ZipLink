# 💻 ZipLink Frontend

A modern React application for peer-to-peer file sharing with WebRTC technology.

## 🏗️ Folder Structure

```
frontend/
├── 📁 public/                                 # Publicly served files
│   └── favicon.ico                            # App icon
│
├── 📁 src/                                    # Source files
│   ├── 🎭 assets/                             # Static assets
│   │   ├── logo.svg                           # App logo
│   │   └── lottie/                            # Animation files
│   │       ├── hourglass.json                 # Loading animation
│   │       ├── receiver.json                  # Receive animation
│   │       └── send_file.json                 # Send animation
│   │
│   ├── 🎨 components/                         # Reusable UI components
│   │   ├── AnimatedBackdrop.jsx               # Background animations
│   │   ├── BrowserCompatibilityNotice.jsx     # Browser warnings
│   │   ├── FeatureCard.jsx                    # Feature display cards
│   │   ├── FeaturesSection.jsx                # Features showcase
│   │   ├── HeroSection.jsx                    # Landing hero section
│   │   ├── HowItWorksSection.jsx              # Usage instructions
│   │   ├── StepCard.jsx                       # Step-by-step cards
│   │   └── index.js                           # Component exports
│   │
│   ├── 📄 pages/                              # Main application pages
│   │   ├── FallbackPage.jsx                   # Error/fallback page
│   │   ├── HomePage.jsx                       # Landing page
│   │   ├── ReceivePage.jsx                    # File receiver interface
│   │   ├── SendPage.jsx                       # File sender interface
│   │   └── TransferPage.jsx                   # Active transfer page
│   │
│   ├── 🔗 services/                           # Business logic
│   │   └── webrtcService.js                   # WebRTC connection handling
│   │
│   ├── 🗃️ store/                             # State management
│   │   └── useAppStore.js                     # Zustand global store
│   │
│   ├── App.jsx                                # Main app component
│   ├── main.jsx                               # App entry point
│   └── index.css                              # Global styles
│
├── eslint.config.js                           # ESLint configuration
├── index.html                                 # HTML template
├── package.json                               # Dependencies & scripts
├── remove_comments.js                         # Build utility
├── tailwind.config.js                         # Tailwind CSS config
└── vite.config.js                             # Vite build config
```

## 🚀 Quick Start

### Prerequisites

-   **Node.js** 16+
-   **npm/yarn/pnpm**

### Installation

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🌐 Environment Variables

Create a `.env` file in the frontend root:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3000
```

## 📱 Development

-   **Dev Server**: [http://localhost:5173](http://localhost:5173)
-   **ESLint**: Run `npm run lint` for code quality checks

## 🛠️ Built With

-   ⚛️ **React 19** - UI Framework
-   ⚡ **Vite 7** - Build Tool
-   🎨 **Tailwind CSS 4** - Styling
-   🔄 **Zustand** - State Management
-   🌐 **React Router** - Navigation
-   🎬 **Lottie React** - Animations
