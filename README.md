# EchoShield
**Tactical Edge AI for Acoustic Drone Detection**

Built during a 48-hour defense hackathon, **EchoShield** is a decentralized, low-cost drone detection system for front-line operators. It uses on-device Machine Learning to listen for drone signatures and shares real-time telemetry across a simulated LoRa mesh network to a tactical React dashboard.


## 🎯 The Mission
In modern conflicts, the biggest threat to a squad operating in dense forests or urban canyons is from above: cheap, weaponized commercial drones. 

Current Counter-UAS solutions (like radar) are expensive, heavy, and worst of all, they emit active signals turning our own troops into targets. Operators need a way to detect threats passively, without giving away their position, even in GPS-denied environments. 

**EchoShield is the solution:** Instead of looking for drones, we listen for them. 


## 🛠️ How It Works (Architecture)

1. **The "Ear" (Edge AI Node):** A Python script simulating an edge device (like an ESP32-S3) captures live audio via microphone. It uses a custom TensorFlow Lite model trained on over 9,000 samples (built on top of Google's YAMNet) to classify the audio.
2. **The "Radio" (WebSocket Mesh):** When a drone is detected with high confidence, the sensor generates a tactical JSON payload (Cursor on Target). In this repository, we use local WebSockets and file watchdogs to simulate the behavior of a decentralized LoRa radio mesh network.
3. **The "Eye" (Tactical C2 Dashboard):** A React/Leaflet frontend acts as a digital twin for an TAK (Team Awareness Kit) plugin. It receives the payload instantly, calculates the Azimuth/Direction, and plots the drone's flight path on a tactical HUD.


## 📂 Repository Structure

```text
ECHOSHIELD/
├── drone_detection/          # Backend: AI Models, Audio Processing & Mesh Server
└── Frontend/                 # Frontend: React Tactical Dashboard
    ├── public/
    ├── src/
    │   ├── components/       # UI elements 
    │   ├── hooks/            # WebSocket connection hooks
    │   ├── utils/tdoa.ts     # Triangulation & Azimuth  logic
    │   ├── App.tsx           # Main dashboard layout
    │   └── App.css           # Tactical/Military HUD styling
    └── package.json