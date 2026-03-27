# ==============================================================================
# ECHO SHIELD - Edge Device Inference (Mic -> IA -> LoRa/ATAK JSON)
# ==============================================================================

import time
import json
import numpy as np
import sounddevice as sd
import tensorflow as tf
import tensorflow_hub as hub

# ------------------------------------------------------------------------------
# 1. INICIALIZAR OS "CÉREBROS"
# ------------------------------------------------------------------------------
print("⏳ A carregar os modelos de IA para a memória...")

# A. Carregar o YAMNet (O "Ouvido" que traduz som para 1024 características)
yamnet_model = hub.load('https://tfhub.dev/google/yamnet/1')

# B. Carregar o vosso modelo tático TFLite (O "Cérebro" que toma a decisão)
TFLITE_PATH = "echoshield_edge_model (3).tflite"
interpreter = tf.lite.Interpreter(model_path=TFLITE_PATH)
interpreter.allocate_tensors()

# Obter as "portas de entrada e saída" do vosso modelo .tflite
input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

print("✅ Sistemas Operacionais. A iniciar escuta tática...")

# ------------------------------------------------------------------------------
# 2. CONFIGURAÇÕES TÁTICAS
# ------------------------------------------------------------------------------
THRESHOLD = 0.85  # Só avisa o ATAK se tiver 85% ou mais de certeza que é drone
DEVICE_ID = "EchoShield_Node_Alpha"
DEVICE_LAT = 38.7223  # Coordenadas falsas para a demo (Lisboa, por ex)
DEVICE_LON = -9.1393


# TESTE DE SANIDADE DO MODELO
print("\n🧪 TESTE DE SANIDADE:")
test_input = np.random.rand(1, 1024).astype(np.float32)
interpreter.set_tensor(input_details[0]['index'], test_input)
interpreter.invoke()
resultado = interpreter.get_tensor(output_details[0]['index'])[0][0]
print(f"   Input aleatório → Confiança: {resultado*100:.2f}%")

test_input_zeros = np.zeros((1, 1024), dtype=np.float32)
interpreter.set_tensor(input_details[0]['index'], test_input_zeros)
interpreter.invoke()
resultado = interpreter.get_tensor(output_details[0]['index'])[0][0]
print(f"   Input zeros     → Confiança: {resultado*100:.2f}%")

test_input_ones = np.ones((1, 1024), dtype=np.float32)
interpreter.set_tensor(input_details[0]['index'], test_input_ones)
interpreter.invoke()
resultado = interpreter.get_tensor(output_details[0]['index'])[0][0]
print(f"   Input uns       → Confiança: {resultado*100:.2f}%\n")

# ------------------------------------------------------------------------------
# 3. O LOOP PRINCIPAL (Corre 24/7 na floresta)
# ------------------------------------------------------------------------------
while True:
    try:
        # Passo 1: Gravar 1 segundo de áudio do microfone (a 16000 Hz)
        # Na demo, aproxima o telemóvel a dar som de drone ao microfone do PC!
        audio_chunk = sd.rec(int(1 * 16000), samplerate=16000, channels=1, dtype='float32')
        sd.wait() # Espera que 1 segundo passe
        audio_chunk = np.squeeze(audio_chunk) # Limpar o formato para 1D

        # Normalização inteligente (não corta o sinal)
        max_val = np.max(np.abs(audio_chunk))
        if max_val > 0.001:  # Há sinal
            audio_chunk = audio_chunk / max_val  # Normaliza para [-1, 1]
        else:
            print(".", end="", flush=True)
            continue  # Silêncio total, salta

        volume_atual = np.max(np.abs(audio_chunk))
        print(f"[Debug] Volume captado: {volume_atual:.2f}")

        # Passo 2: Extrair os 1024 embeddings usando o YAMNet
        _, embeddings, _ = yamnet_model(audio_chunk)
        embedding_medio = tf.reduce_mean(embeddings, axis=0) # Fazer a média
        
        # Preparar os dados para entrar na IA (adicionar dimensão do batch)
        input_data = np.expand_dims(embedding_medio.numpy(), axis=0)

        # Passo 3: Passar os dados para o vosso .tflite e pedir a previsão
        interpreter.set_tensor(input_details[0]['index'], input_data)
        interpreter.invoke()
        
        # Obter o resultado (vai ser um número entre 0.0 e 1.0)
        certeza = interpreter.get_tensor(output_details[0]['index'])[0][0]

        # Passo 4: Tomar a decisão e enviar para o ATAK
        if certeza >= THRESHOLD:
            # Gerar o Payload JSON Tático
            payload = {
                "device_id": DEVICE_ID,
                "threat_type": "UAV/Drone",
                "confidence": round(float(certeza) * 100, 2), # Ex: 95.42
                "latitude": DEVICE_LAT,
                "longitude": DEVICE_LON,
                "timestamp": int(time.time())
            }
            
            payload_json = json.dumps(payload)
            
            # Aqui entraria o código real do LoRa (ex: porta Serial/UART)
            # Para o Hackathon, imprimimos a vermelho para impressionar!
            print(f"\n🚨 [ALERTA LORA] ENVIANDO PARA ATAK: {payload_json}")
            
            # Pausa de 3 segundos para não inundar a rede rádio do ATAK
            time.sleep(3) 
            pass
        else:
            # Imprime um pontinho só para sabermos que está vivo e a ouvir
            print(".", end="", flush=True)

            percentagem = certeza * 100
            print(f"[SILÊNCIO/RUÍDO] Confiança de ser Drone: {percentagem:.2f}%")

    except KeyboardInterrupt:
        print("\n🛑 Sistema encerrado pelo operador.")
        break