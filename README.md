# AudioSphere AI

AudioSphere AI is an interactive web application that leverages Google Gemini AI to identify songs from user audio input and generate content from spoken requests. Sing, hum, or speak to interact with advanced AI models—all in your browser.

---

## ✨ Features

- **Song Identification:** Sing or hum a tune, and the app identifies the song and artist using Gemini AI.
- **Voice-to-Content Generation:** Speak a request (e.g., "Write a poem about the sea") and receive generated content instantly.
- **Modern 3D Visuals:** Immersive 3D audio visualization for a rich user experience.
- **Privacy First:** All processing happens client-side; your audio never leaves your device except for AI inference.
- **Custom API Key Support:** Easily use your own Gemini API key for full control.

---

## 🛠 Tech Stack

- **Frontend:** [LitElement](https://lit.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **AI Integration:** [Google Gemini AI](https://aistudio.google.com/)
- **3D Visualization:** Custom WebGL shaders
- **Audio Processing:** Web Audio API

---

## ⚙️ Installation

**Prerequisites:**

- [Node.js](https://nodejs.org/) (v16+ recommended)

1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/audiosphere-ai.git
   cd audiosphere-ai
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Run the development server:**
   ```sh
   npm run dev
   ```
4. **Open your browser:**  
   Navigate to `http://localhost:3000` to see AudioSphere AI in action.

---

## 🎭 Usage

- **Identifying Songs:**

  - Click on the microphone icon and sing or hum the tune.
  - The app will process the audio and display the song and artist.

- **Generating Content:**
  - Speak your request clearly after clicking the microphone.
  - Receive and enjoy the generated content.

---

## 📝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/YourFeature`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add some feature'`).
5. Push to the branch (`git push origin feature/YourFeature`).
6. Open a pull request.

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Acknowledgments

- **Google Gemini AI** for the amazing AI capabilities.
- **LitElement** and **Vite** for the powerful frontend tools.

Enjoy your journey with
