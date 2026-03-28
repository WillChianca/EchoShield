import json
import os
import time

os.makedirs("jsonDados", exist_ok=True)

# A posição central da vossa equipa (os soldados)
ALVO_LAT = 38.722
ALVO_LON = -9.1418

# A posição onde o drone é detetado pela primeira vez (longe a Norte)
DRONE_LAT_INICIAL = 38.7300
DRONE_LON_INICIAL = -9.1300

NUM_PASSOS = 15 # O drone vai atualizar a sua posição 15 vezes
ESPERA_SEGUNDOS = 1.5 # Tempo entre cada salto no mapa

print("🚨 SIMULAÇÃO DE ATAQUE INICIADA")
print("O drone inimigo está a aproximar-se da vossa posição...")

for passo in range(NUM_PASSOS):
    # Calcular o quão perto o drone já está (de 0.0 a 1.0)
    progresso = passo / float(NUM_PASSOS - 1)
    
    # A matemática simples para o drone deslizar em linha reta até aos soldados
    lat_atual = DRONE_LAT_INICIAL + (ALVO_LAT - DRONE_LAT_INICIAL) * progresso
    lon_atual = DRONE_LON_INICIAL + (ALVO_LON - DRONE_LON_INICIAL) * progresso
    
    # A confiança da IA aumenta à medida que o drone se aproxima! (Fixe para a Demo)
    confianca_atual = 60.0 + (39.0 * progresso) 
    
    # O Payload que vai ser atirado para o React
    payload = {
        "device_id": "EchoShield_Node_Alpha", # Vamos usar só um nó para simplificar a demo de voo
        "threat_type": "UAV/Drone",
        "confidence": round(confianca_atual, 2),
        "latitude": lat_atual,
        "longitude": lon_atual,
        "timestamp": time.time(),
        "analysis_id": int(time.time()) # Cada passo é um evento novo
    }
    
    # Guardar na pasta para o WebSocket apanhar
    filename = f"jsonDados/sim_voo_{payload['analysis_id']}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(payload, f)
        
    print(f"[{passo+1}/{NUM_PASSOS}] Drone avistado a mover-se: Confiança {confianca_atual:.1f}%")
    
    # Esperar um bocadinho para a animação ficar fixe no ecrã
    time.sleep(ESPERA_SEGUNDOS)

print("💥 ALVO COMPROMETIDO. Fim da simulação.")