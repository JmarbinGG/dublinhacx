#!/usr/bin/env python3
"""
Tunnel the local backend (8000) and frontend (5173) through ngrok, and point
the frontend's VITE_API_BASE_URL at the backend tunnel.

Run this while `uvicorn` and `npm run dev` are already running locally.
Ctrl+C to stop: tunnels are killed and .env.local is restored to whatever
it was before this script ran (or removed, if it didn't exist).

Usage: python3 tunnel.py
"""
import atexit
import json
import shutil
import signal
import subprocess
import sys
import urllib.request
from pathlib import Path

BACKEND_PORT = 8000
FRONTEND_PORT = 5173

ROOT = Path(__file__).resolve().parent
ENV_LOCAL = ROOT / "frontend" / "react" / ".env.local"

ngrok_procs: list[subprocess.Popen] = []
original_env_content: str | None = None
env_existed = False


def check_alive(port: int) -> bool:
    try:
        urllib.request.urlopen(f"http://localhost:{port}", timeout=2)
        return True
    except Exception:
        try:
            urllib.request.urlopen(f"http://localhost:{port}/health", timeout=2)
            return True
        except Exception:
            return False


def start_ngrok(port: int) -> tuple[subprocess.Popen, str]:
    proc = subprocess.Popen(
        ["ngrok", "http", str(port), "--log=stdout", "--log-format=json"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    ngrok_procs.append(proc)

    for line in proc.stdout:
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if record.get("msg") == "started tunnel" and "url" in record:
            return proc, record["url"]
        if "lvl" in record and record["lvl"] == "error":
            print(f"ngrok error: {record.get('msg')}", file=sys.stderr)

    raise RuntimeError(f"ngrok never reported a tunnel URL for port {port}")


def write_backend_url(url: str) -> None:
    ENV_LOCAL.parent.mkdir(parents=True, exist_ok=True)
    ENV_LOCAL.write_text(f"VITE_API_BASE_URL={url}\n")


def restore_env() -> None:
    if env_existed:
        ENV_LOCAL.write_text(original_env_content)
        print(f"Restored {ENV_LOCAL} to its previous contents.")
    elif ENV_LOCAL.exists():
        ENV_LOCAL.unlink()
        print(f"Removed {ENV_LOCAL} (frontend falls back to http://localhost:{BACKEND_PORT}).")
    print("Restart the frontend dev server to pick this up.")


def cleanup() -> None:
    for proc in ngrok_procs:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    restore_env()


def main() -> None:
    global original_env_content, env_existed

    if not shutil.which("ngrok"):
        sys.exit("ngrok not found on PATH. Install it first: https://ngrok.com/download")

    if ENV_LOCAL.exists():
        env_existed = True
        original_env_content = ENV_LOCAL.read_text()

    if not check_alive(BACKEND_PORT):
        print(f"Warning: nothing responding on localhost:{BACKEND_PORT} yet.")
    if not check_alive(FRONTEND_PORT):
        print(f"Warning: nothing responding on localhost:{FRONTEND_PORT} yet.")

    atexit.register(cleanup)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    print("Starting backend tunnel...")
    _, backend_url = start_ngrok(BACKEND_PORT)
    print(f"Backend:  {backend_url}")

    print("Starting frontend tunnel...")
    _, frontend_url = start_ngrok(FRONTEND_PORT)
    print(f"Frontend: {frontend_url}")

    write_backend_url(backend_url)
    print(f"\nWrote {ENV_LOCAL} -> VITE_API_BASE_URL={backend_url}")
    print("Restart the frontend dev server now so it picks up the new API URL.")
    print(f"\nShare this link: {frontend_url}")
    print("\nPress Ctrl+C to stop tunnels and restore localhost.")

    try:
        signal.pause()
    except AttributeError:
        # signal.pause() isn't available on Windows.
        for proc in ngrok_procs:
            proc.wait()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
