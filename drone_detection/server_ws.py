"""
EchoShield — WebSocket Server
Faz bridge entre os alertas JSON (gerados pelo echoshield_mic.py)
e o frontend React em tempo real.

Instalar:
    pip install websockets watchdog

Correr:
    python server_ws.py

O React conecta-se a ws://localhost:8765
"""

import asyncio
import json
import os
import time
import websockets
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

JSON_DIR = "jsonDados"
HOST     = "172.20.10.2"
PORT     = 8765

# Conjunto de clientes React ligados
connected_clients: set = set()


# ── Watchdog: detecta ficheiros novos na pasta jsonDados ──────
class AlertHandler(FileSystemEventHandler):
    def __init__(self, loop):
        self.loop = loop

    def on_created(self, event):
        if event.is_directory:
            return
        if not event.src_path.endswith(".json"):
            return

        # Pequena pausa para garantir que o ficheiro foi escrito por completo
        time.sleep(0.05)

        try:
            with open(event.src_path, "r", encoding="utf-8") as f:
                payload = json.load(f)

            print(f"📡  Novo alerta detectado: {os.path.basename(event.src_path)}")

            # Enviar para todos os clientes React ligados
            asyncio.run_coroutine_threadsafe(
                broadcast(json.dumps(payload)),
                self.loop
            )
        except Exception as e:
            print(f"⚠️  Erro ao ler JSON: {e}")


async def broadcast(mensagem: str):
    if not connected_clients:
        return
    await asyncio.gather(
        *[client.send(mensagem) for client in connected_clients],
        return_exceptions=True
    )


# ── WebSocket handler ─────────────────────────────────────────
async def handler(websocket):
    connected_clients.add(websocket)
    addr = websocket.remote_address
    print(f"🔌  React ligado: {addr}  ({len(connected_clients)} cliente(s))")

    # Ao ligar, envia os últimos 10 alertas já existentes (histórico)
    historico = carregar_historico(10)
    for alerta in historico:
        await websocket.send(json.dumps(alerta))

    try:
        await websocket.wait_closed()
    finally:
        connected_clients.discard(websocket)
        print(f"🔌  React desligado: {addr}  ({len(connected_clients)} cliente(s))")


def carregar_historico(n: int) -> list:
    os.makedirs(JSON_DIR, exist_ok=True)
    ficheiros = sorted(
        [f for f in os.listdir(JSON_DIR) if f.endswith(".json")],
        reverse=True
    )[:n]
    resultado = []
    for f in reversed(ficheiros):
        try:
            with open(os.path.join(JSON_DIR, f), "r", encoding="utf-8") as fp:
                resultado.append(json.load(fp))
        except Exception:
            pass
    return resultado


# ── Main ──────────────────────────────────────────────────────
async def main():
    os.makedirs(JSON_DIR, exist_ok=True)
    loop = asyncio.get_event_loop()

    # Iniciar watchdog numa thread separada
    handler_fs = AlertHandler(loop)
    observer = Observer()
    observer.schedule(handler_fs, JSON_DIR, recursive=False)
    observer.start()
    print(f"👁️   A observar pasta: ./{JSON_DIR}/")

    # Iniciar servidor WebSocket
    async with websockets.serve(handler, HOST, PORT):
        print(f"🚀  WebSocket server em ws://{HOST}:{PORT}")
        print("    Aguarda ligação do React... (Ctrl+C para parar)\n")
        await asyncio.Future()  # corre para sempre


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n⏹️  Servidor parado.")