# 🎰 Bingo Royale

[![Python](https://img.shields.io/badge/Python-3.8%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-2.x-lightgrey?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.x-black?logo=socket.io&logoColor=white)](https://socket.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A **premium, real-time multiplayer Bingo game** designed for LAN play. Host a game on your laptop and have your friends join instantly by scanning a QR code on their phones!

---

## ✨ Features

- 🎮 **Real-time Multiplayer**: Powered by WebSockets (Socket.io) for instantaneous number syncing.
- 🏠 **Private Game Rooms**: Create unique rooms and share invite links easily.
- 📷 **QR Code Join**: Scan a generated QR code on the host's screen to join the lobby instantly.
- 🎯 **Turn-Based Calling**: Players take turns picking numbers to complete their boards.
- 🕵️ **Suspense Mode**: Opponent line counts are hidden (`? Lines`) to keep the competition intense!
- 🎨 **Modern UI**: Dark gaming theme with smooth animations and responsive design.
- ⚡ **Auto-Fill**: One-click random board generation for quick starts.

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have **Python 3.8+** installed on your machine.

### 2. Installation
Clone the repository and install the dependencies:
```bash
git clone https://github.com/Ghost-101-ui/Bingo-Royale.git
cd Bingo-Royale
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Run the Server
```bash
python app.py
```
The server will start on `http://0.0.0.0:5000`. 

### 4. Join the Game
- **Host**: Open `http://localhost:5000` in your browser.
- **Players**: Connect to the same Wi-Fi as the host and scan the QR code displayed in the Lobby, or visit `http://HOST_IP:5000`.

---

## 🛠️ Built With

- **Backend**: Python, Flask, Flask-SocketIO, Eventlet
- **Frontend**: HTML5, Vanilla JavaScript, CSS3
- **QR Generation**: QRCode.js

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Created with ❤️ by [Ghost-101-ui](https://github.com/Ghost-101-ui)
