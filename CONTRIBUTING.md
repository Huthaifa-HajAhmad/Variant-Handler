# Contributing to Variant Handler

Thank you for your interest in contributing to Variant Handler! As a tool built for clinical research and molecular pathology workflows, maintaining high reliability, safety, and security is of paramount importance.

Please review this guide to get started with setting up your local environment, writing code, and submitting contributions.

---

## Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) version 18 or higher.
- Google Chrome or any Chromium-based browser supporting MV3 extensions.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Huthaifa-HajAhmad/Variant-Handler.git
   cd Variant-Handler
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```
   This will start a Vite local server (usually on `http://localhost:3000`). You can view and interact with the Side Panel UI directly in the browser for rapid UI styling and validation.

---

## Building the Extension

To run Variant Handler as a Chrome Extension (including the background script, content scripts, and side panel):

1. Compile the TypeScript files and build the extension bundle:
   ```bash
   npm run build
   ```
   This compiles and bundles all assets into the `dist/` directory.

2. Load the unpacked extension in Chrome:
   - Navigate to `chrome://extensions/` in your Chrome browser.
   - Toggle **Developer mode** in the top-right corner.
   - Click the **Load unpacked** button in the top-left corner.
   - Select the `dist` directory generated at the root of the project.

---

## Testing

Variant Handler uses [Vitest](https://vitest.dev/) for unit testing. All contributions should pass existing tests, and new features or bug fixes should include corresponding tests.

- Run tests once:
   ```bash
   npm test
   ```
- Run tests in watch/interactive mode:
   ```bash
   npm run test:watch
   ```
- Launch the Vitest graphical UI in your browser:
   ```bash
   npm run test:ui
   ```

---

## Code Quality & Guidelines

Before submitting a Pull Request, please ensure:

1. **Type Safety**: Runs clean without TypeScript compilation errors. Verify by running:
   ```bash
   npm run lint
   ```
2. **Least Privilege**: Only request necessary permissions in `public/manifest.json`. Do not introduce unused host permissions or capabilities.
3. **No Hardcoded Secrets**: Do not commit any API keys, credentials, or personal configuration values. All API keys or environment configs must use environment variables or user-configured options.
4. **HTML Escaping & Sanitization**: Any external input or variant data exported via `exporters.ts` or displayed in the UI must be properly sanitized and escaped (e.g., using `escapeHtml`) to prevent Cross-Site Scripting (XSS).

---

## Submission Process

1. Create a descriptive feature branch from the `main` branch.
2. Commit your changes with clear, descriptive commit messages.
3. Push your branch to your fork and submit a Pull Request.
4. Ensure all CI status checks (build, test, lint) pass successfully.
