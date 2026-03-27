import sounddevice as sd
import numpy as np

print("🎤 A listar todas as placas de som do teu PC:")
print(sd.query_devices())

print("\n🔊 A escutar o microfone principal... Faz barulho! (Ctrl+C para parar)")

try:
    while True:
        # Grava 0.5 segundos de áudio
        audio = sd.rec(int(0.5 * 16000), samplerate=16000, channels=1, dtype='float32')
        sd.wait()
        
        # Calcula o volume máximo apanhado
        volume = np.max(np.abs(audio))
        
        # Desenha uma barrinha de volume no terminal
        barras = "|" * int(volume * 50)
        print(f"Volume: {volume:.4f} {barras}")
except KeyboardInterrupt:
    print("\nTeste terminado.")