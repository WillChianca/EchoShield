"""
EchoShield - Detecção de Drones em Tempo Real (Microfone) + Alertas JSON
Grava X segundos → extrai embedding com YAMNet → classifica com EchoShield
Se drone detectado → guarda JSON em ./jsonDados/

Uso:
    python echoshield_mic.py --modelo echoshield_edge_model.tflite
    python echoshield_mic.py --modelo echoshield_edge_model.tflite --intervalo 3 --pausa 5
"""

import argparse
import json
import os
import sys
import time
import numpy as np

# ── Dependências ──────────────────────────────────────────────
try:
    import sounddevice as sd
except ImportError:
    print("❌  pip3 install sounddevice")
    sys.exit(1)

try:
    import tensorflow as tf
except ImportError:
    print("❌  pip3 install tensorflow")
    sys.exit(1)

try:
    import tensorflow_hub as hub
except ImportError:
    print("❌  pip3 install tensorflow-hub")
    sys.exit(1)

SAMPLE_RATE = 16000  # Hz obrigatório para YAMNet

# ── Configurações táticas ─────────────────────────────────────
DEVICE_ID  = "EchoShield_Node_Gamma"
DEVICE_LAT = 38.72085   # Lisboa (alterar para coordenadas reais do nó)
DEVICE_LON = -9.13855
JSON_DIR   = "jsonDados"


# ── Pasta de output JSON ──────────────────────────────────────
def criar_pasta_json():
    os.makedirs(JSON_DIR, exist_ok=True)
    print(f"📁  Alertas JSON → ./{JSON_DIR}/")


# ── Guardar alerta em JSON ─────────────────────────────
def guardar_alerta_json(prob: float, n: int):
    # analysis_id = janela de 5 segundos — sincroniza entre sensores
    analysis_id = int(time.time()) // 5

    payload = {
        "device_id":   DEVICE_ID,
        "threat_type": "UAV/Drone",
        "confidence":  round(prob * 100, 2),
        "latitude":    DEVICE_LAT,
        "longitude":   DEVICE_LON,
        "timestamp":   int(time.time_ns()),
        "analysis_id": analysis_id,
    }

    nome = f"alerta_{payload['timestamp']}_{DEVICE_ID}.json"
    caminho = os.path.join(JSON_DIR, nome)

    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"  💾  JSON guardado → {caminho}")
    print(f"  📡  Payload: {json.dumps(payload)}")
    return payload


# ── Carregar modelos ──────────────────────────────────────────
def carregar_modelos(caminho_echoshield: str):
    print("⏳  A carregar YAMNet...")
    yamnet = hub.load("https://tfhub.dev/google/yamnet/1")
    print("✅  YAMNet pronto")

    print("⏳  A carregar EchoShield...")
    try:
        interp = tf.lite.Interpreter(model_path=caminho_echoshield)
        interp.allocate_tensors()
        print("✅  EchoShield .tflite pronto")
        return yamnet, interp
    except Exception as e:
        print(f"❌  Erro ao carregar EchoShield: {e}")
        sys.exit(1)


# ── Teste de sanidade ─────────────────────────────────────────
def teste_sanidade(interp):
    idx_ent = interp.get_input_details()[0]['index']
    idx_sai = interp.get_output_details()[0]['index']

    print("\n🧪  TESTE DE SANIDADE DO MODELO:")

    for nome, dados in [
        ("Input aleatório", np.random.rand(1, 1024).astype(np.float32)),
        ("Input zeros    ", np.zeros((1, 1024), dtype=np.float32)),
        ("Input uns      ", np.ones((1, 1024),  dtype=np.float32)),
    ]:
        interp.set_tensor(idx_ent, dados)
        interp.invoke()
        res = interp.get_tensor(idx_sai)[0][0]
        print(f"   {nome} → {res*100:.2f}%")

    print("   (valores diferentes entre si = modelo saudável ✅)\n")


# ── Gravar áudio ──────────────────────────────────────────────
def gravar(segundos: float) -> np.ndarray:
    print(f"🎙️   A gravar {segundos}s...", end=" ", flush=True)
    audio = sd.rec(
        int(segundos * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype='float32'
    )
    sd.wait()
    print("✔", flush=True)
    return audio.flatten()


# ── Extrair embedding ─────────────────────────────────────────
def extrair_embedding(yamnet, audio: np.ndarray) -> np.ndarray:
    audio_norm = audio / (np.max(np.abs(audio)) + 1e-9)
    audio_tf   = tf.cast(audio_norm, tf.float32)
    _, embeddings, _ = yamnet(audio_tf)
    return tf.reduce_mean(embeddings, axis=0).numpy().reshape(1, 1024)


# ── Classificar ───────────────────────────────────────────────
def classificar(interp, embedding: np.ndarray) -> float:
    idx_ent = interp.get_input_details()[0]['index']
    idx_sai = interp.get_output_details()[0]['index']
    interp.set_tensor(idx_ent, embedding.astype(np.float32))
    interp.invoke()
    return float(interp.get_tensor(idx_sai)[0][0])


# ── Calcular confiança ────────────────────────────────────────
def calcular_confianca(prob: float, limiar: float) -> str:
    distancia    = abs(prob - limiar) / max(limiar, 1 - limiar)
    confianca_pct = distancia * 100

    if confianca_pct >= 80:
        nivel, estrelas = "Muito alta ", "★★★★★"
    elif confianca_pct >= 60:
        nivel, estrelas = "Alta       ", "★★★★☆"
    elif confianca_pct >= 40:
        nivel, estrelas = "Média      ", "★★★☆☆"
    elif confianca_pct >= 20:
        nivel, estrelas = "Baixa      ", "★★☆☆☆"
    else:
        nivel, estrelas = "Muito baixa", "★☆☆☆☆"

    return f"{nivel} {estrelas} ({confianca_pct:.0f}%)"


# ── Mostrar resultado ─────────────────────────────────────────
def mostrar(prob: float, limiar: float, tempo_ms: float, n: int):
    pct        = prob * 100
    preenchido = int(prob * 30)
    barra      = "█" * preenchido + "░" * (30 - preenchido)

    if prob >= 0.8:
        estado = "🚨 DRONE DETECTADO!"
    elif prob >= limiar:
        estado = "⚠️  Possível drone"
    elif prob >= 0.2:
        estado = "🟡  Provavelmente limpo"
    else:
        estado = "✅  Sem drone"

    confianca = calcular_confianca(prob, limiar)

    print(f"  ┌─ Análise #{n} {'─'*35}")
    print(f"  │  Probabilidade : [{barra}] {pct:5.1f}%")
    print(f"  │  Decisão       : {estado}")
    print(f"  │  Confiança     : {confianca}")
    print(f"  │  Tempo         : {tempo_ms:.0f}ms")
    print(f"  └{'─'*43}")


# ── Loop principal ────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--modelo",    default="echoshield_edge_model.tflite")
    parser.add_argument("--intervalo", type=float, default=3.0,
                        help="Segundos de áudio por análise (default: 3.0)")
    parser.add_argument("--pausa",     type=float, default=5.0,
                        help="Segundos de espera entre análises (default: 5.0)")
    parser.add_argument("--limiar",    type=float, default=0.5,
                        help="Limiar de decisão (default: 0.5)")
    args = parser.parse_args()

    criar_pasta_json()
    yamnet, interp = carregar_modelos(args.modelo)
    teste_sanidade(interp)

    print("═" * 55)
    print("  🎙️  EchoShield — Monitorização em Tempo Real")
    print(f"  Gravação : {args.intervalo}s  |  Pausa : {args.pausa}s  |  Limiar : {args.limiar*100:.0f}%")
    print("  Ctrl+C para parar")
    print("═" * 55 + "\n")

    n = 0
    try:
        while True:
            n += 1
            audio = gravar(args.intervalo)

            rms = np.sqrt(np.mean(audio ** 2))
            if rms < 1e-4:
                print("  🔇  Silêncio — a ignorar\n")
            else:
                t0        = time.perf_counter()
                embedding = extrair_embedding(yamnet, audio)
                prob      = classificar(interp, embedding)
                tempo_ms  = (time.perf_counter() - t0) * 1000

                mostrar(prob, args.limiar, tempo_ms, n)

                # ── Alerta JSON se drone detectado ────────────────
                if prob >= args.limiar:
                    print()
                    guardar_alerta_json(prob, n)
                    # Pausa extra para não inundar o ATAK
                    print(f"  ⏳  Cooldown de 3s após alerta...\n")
                    time.sleep(3)

            print(f"  ⏳  Próxima análise em {args.pausa:.0f}s...\n")
            time.sleep(args.pausa)

    except KeyboardInterrupt:
        print("\n  ⏹️  Parado.\n")


if __name__ == "__main__":
    main()