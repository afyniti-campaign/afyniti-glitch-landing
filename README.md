# Afyniti Glitch Landing

A Next.js 14+ application featuring a WebGL-powered glitch effect hero component. Built with modern React patterns and the App Router.

## 🚀 Quick Start

```bash
# Install dependencies
npm install
# or
pnpm install
# or
yarn install

# Start development server
npm run dev
# or
pnpm dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## 📦 Technology Stack

- **Framework**: Next.js 14.2.16 with App Router
- **UI**: React 18 with TypeScript
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **Graphics**: WebGL shaders for real-time glitch effects
- **Components**: shadcn/ui library (49 components available)
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts for data visualization
- **Fonts**: Geist Sans and Geist Mono

## 🏗️ Project Structure

```
├── app/                    # Next.js App Router pages and layouts
├── components/             # Reusable React components
│   └── ui/                # shadcn/ui component library (49 components)
├── hooks/                 # Custom React hooks (use-mobile, use-toast)
├── lib/                   # Utility functions and shared logic
├── public/                # Static assets (hero images, logo.png)
└── styles/                # Global CSS and theme definitions
```

## ✨ Key Features

- **WebGL Glitch Effect**: Complex fragment shader with dynamic background and logo distortion
- **Session Persistence**: Maintains glitch seed values across page reloads
- **Responsive Design**: Mobile-optimized with different hero images
- **Theme System**: Complete light/dark mode support with CSS custom properties
- **Fallback Handling**: Graceful degradation when WebGL is unavailable

## 🛠️ Development Commands

```bash
# Development server
npm run dev

# Build application
npm run build

# Production server
npm run start

# Linting
npm run lint
```

## 🎨 Component Architecture

The main page component (`app/page.tsx`) is a sophisticated WebGL application that:
- Manages multiple canvas contexts for rendering and noise overlay
- Implements real-time shader uniforms for mouse interaction and time-based animation
- Handles image loading with proper error states
- Uses refs extensively to avoid unnecessary re-renders during animation loops

## ⚙️ Configuration

- TypeScript strict mode enabled
- ESLint and build errors are ignored (configured in next.config.mjs)
- Path aliases configured: `@/*` maps to project root
- shadcn/ui configured with New York style and neutral base color