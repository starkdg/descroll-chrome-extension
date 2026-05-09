# DeScroll Chrome Extension

[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.8-blue.svg)](package.json)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](manifest.json)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Extension-green.svg)](https://chrome.google.com/webstore)

DeScroll is a Chrome Extension designed to replace the habit-forming
infinite scroll of social media with a "beneficial scroll" of curated
content sourced entirely from your own bookmarks.  The idea is to help
you scroll with intention through the latest content you want to see.

## Overview

The extension overrides the default Chrome New Tab page
(chrome://newtab) with a custom interface.  It uses the domains found
in your bookmarks to source new content it can display every time you
open a new tab.  DeScroll helps you rediscover the high-quality
content you already know you want to see.

### Key Features
- **Bookmark Feed:** Uses the feeds associated with your bookmarks as a source for new content. 
- **Intentional Design:** A minimalist interface focused on readability and clarity.
- **High-Resolution Icons:** Supports high-quality favicons and dynamic domain-colored placeholders.
- **Privacy First:** Operates entirely locally; your bookmarks never leave your browser.

## Technologies
- **Manifest V3:** The latest Chrome Extension standard.
- **Vanilla JS:** No external frameworks for maximum performance and simplicity.
- **Webpack 5:** Efficient bundling and automated packaging.
- **IntersectionObserver API:** Powers the smooth infinite scroll mechanism.

## Installation

### For Users (Manual Installation)
1. Download the latest release from the [releases/](releases/) directory.
2. Unzip the file to a local folder.
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** in the top right corner.
5. Click **Load unpacked** and select the folder where you unzipped the extension.

### For Developers
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/descroll-chrome-extension.git
   cd descroll-chrome-extension
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Test the project
   ```bash
   npm run test
   ```
4. Load the `dist/` folder into Chrome as an unpacked extension (see steps 3-5 in the Users section).

## Development

### Available Scripts
- `npm run build`: Bundles the project using Webpack into the `dist/` directory.
- `npm run package`: Cleans the workspace, builds the project, and creates a ZIP artifact in the `releases/` directory.
- `npm run test`: Runs the test suite using Vitest.
- `npm run clean`: Removes build artifacts and old packages.

## How to Use
1. **Open a New Tab:** Once installed, DeScroll replaces your default new tab page.
2. **Scroll and Discover:** Your bookmarks will appear in a shuffled feed. Scroll down to see more.
3. **Settings:** Click the settings icon to switch to a different bookmark folder or change the configuration that controls how new content gets pulled.
4. **Diagnostic Tool** In the settings, there is also a tool you can use to check if a URL has any discoverable feeds.  Use this if you don't see any content coming from a site you have bookmarked.

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request or open an issue for any bugs or feature requests.

## License
This project is licensed under the GNU GPL v2.0 License - see the [LICENSE](LICENSE) file for details.
