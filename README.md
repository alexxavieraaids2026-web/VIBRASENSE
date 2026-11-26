# ESP32 Predictive Maintenance & Vibration Monitor

Real-time Web Serial dashboard (`115200` baud, `8N1`) for monitoring ESP32 vibration telemetry and classifying equipment health across 4 maintenance urgency tiers.

## Quick Start

1. Close **Arduino IDE Serial Monitor** (or any other app holding `COM5`).
2. Double-click `start-server.bat` (or run `powershell -ExecutionPolicy Bypass -File .\start-server.ps1`).
3. Open `http://127.0.0.1:8080` (or `http://localhost:8080`) in **Google Chrome** or **Microsoft Edge**.
4. Click **Connect COM Port (e.g., COM5)** and select your ESP32 port.
   - To preview all 4 tiers without hardware connected, click **Simulate Stream**.

## Expected Serial Format

```text
Window: NORMAL | Max dev: 0.12 | Last 5 anomalies: 0 | LED: OFF | Buzzer: OFF
```
