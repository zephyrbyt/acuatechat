# 🔒 Acuate.chat
> Open-source, E2EE chat routed through the Tor network. No accounts, no metadata, no traces — just private conversations.

![License](https://img.shields.io/github/license/zephyrbyt/acuatechat)
![Stars](https://img.shields.io/github/stars/zephyrbyt/acuatechat)
![Issues](https://img.shields.io/github/issues/zephyrbyt/acuatechat)

---

## Features

- 🧅 **Tor Network Routing** — All traffic is routed through Tor, masking your IP and location
- 🔐 **End-to-End Encryption** — Messages are encrypted client-side; no one but you and your recipient can read them
- 👤 **No Accounts** — No sign-up, no email, no phone number required
- 📭 **Zero Metadata** — No logs, no timestamps stored, no message history on any server
- 🌍 **Open Source** — Fully auditable code, because trust shouldn't be blind

---

## Getting Started

### For Users

1. Head to the [Releases](https://github.com/yourusername/acuate.chat/releases) tab
2. Download the latest `.exe` installer
3. Run it — that's it. Acuate.chat will be ready to go

### For Developers

You'll need the latest version of NodeJS installed and to get a Tor executable from [here](https://www.torproject.org/download/tor/) in order to get the app working. The tor executable is not included in the source.

1. Fork or download this repository as a ZIP
2. Extract and open the folder in your terminal
3. Install dependencies:
```bash
npm i
```
4. Place your Tor executable in the resources folder
4. Everything is ready — dive in!

---

## How It Works

1. Your client connects to the Tor network on launch
2. Messages are encrypted locally before being sent
3. Encrypted data travels through Tor relays to the recipient
4. The recipient's client decrypts the message — no plaintext ever leaves your device

---

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push and open a Pull Request

---

> ⚠️ Acuate.chat is intended for legitimate privacy use. Please always comply with your local laws.

---

## Acknowledgements

Acuate.chat is built on the shoulders of these open-source projects:

| Project | License |
|---|---|
| [Electron](https://github.com/electron/electron) | MIT |
| [React](https://github.com/facebook/react) | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache 2.0 |
| [Chakra UI](https://github.com/chakra-ui/chakra-ui) | MIT |
| [Framer Motion](https://github.com/framer/motion) | MIT |
| [React Icons](https://github.com/react-icons/react-icons) | MIT |
| [TweetNaCl.js](https://github.com/dchest/tweetnacl-js) | Public Domain |
| [SOCKS](https://github.com/JoshGlazebrook/socks) | MIT |
| [uuid](https://github.com/uuidjs/uuid) | MIT |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT |
| [electron-vite](https://github.com/alex8088/electron-vite) | MIT |
| [@scure/bip39](https://github.com/paulmillr/scure-bip39) | MIT |
| [Twemoji](https://github.com/twitter/twemoji) | MIT + CC-BY 4.0 |
| [Tor](https://www.torproject.org/) | BSD-3-Clause |

This product is produced independently from the Tor® anonymity software and carries no guarantee from The Tor Project about quality, suitability or anything else.
