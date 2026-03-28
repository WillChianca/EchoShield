import json
import os
import time

# Garante que a pasta existe
os.makedirs("jsonDados", exist_ok=True)

# 1. Criar um ID único para o evento (Obrigatório para o vosso React agrupar os 3)
analysis_id = int(time.time())

# 2. O momento exato do "estrondo" ou zumbido
tempo_base = time.time()

# 3. Vamos simular que o som chegou ao Alpha primeiro, depois ao Beta, depois ao Gamma
# A diferença de milissegundos é o que a vossa matemática vai usar para calcular a posição!
# 3. MUDAMOS OS TEMPOS PARA SIMULAR UM SOM VINDO DE NOROESTE
sensores = [
    {
        "device_id": "EchoShield_Node_Alpha",
        "threat_type": "UAV/Drone",
        "confidence": 98.5,
        "latitude": 38.7223,
        "longitude": -9.1393,
        "timestamp": tempo_base + 0.450,   # Ouve 450ms depois do Beta
        "analysis_id": analysis_id
    },
    {
        "device_id": "EchoShield_Node_Beta",
        "threat_type": "UAV/Drone",
        "confidence": 95.0,
        "latitude": 38.72165,
        "longitude": -9.1411,
        "timestamp": tempo_base,           # Ouve PRIMEIRO (Tempo Zero)
        "analysis_id": analysis_id
    },
    {
        "device_id": "EchoShield_Node_Gamma",
        "threat_type": "UAV/Drone",
        "confidence": 92.0,
        "latitude": 38.72085,
        "longitude": -9.13855,
        "timestamp": tempo_base + 1.300,   # Ouve mais de 1 segundo depois (está mais longe)
        "analysis_id": analysis_id
    }
]

print("🚁 A enviar coordenadas simuladas para a rede Mesh...")

# 4. Gravar os 3 ficheiros na pasta para o vosso servidor os apanhar
for i, det in enumerate(sensores):
    filename = f"jsonDados/teste_tdoa_{analysis_id}_{i}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(det, f)
    print(f"✅ {det['device_id']} disparou alerta!")
    
    # Pausa minúscula para o watchdog do servidor ter tempo de ler o ficheiro
    time.sleep(0.1)

print("\n🎯 Olha para a Dashboard! O algoritmo de Triangulação (TDOA) deve ter calculado a posição.")