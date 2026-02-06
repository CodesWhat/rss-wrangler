# Synology deployment notes

1. Copy `infra/.env.example` to `infra/.env` and set secrets.
2. From repo root:
   ```bash
   docker compose -f infra/docker-compose.yml up --build -d
   ```
3. Access web UI at `http://<tailscale-hostname>:3000`.
4. Keep API private to Tailscale; do not expose to public WAN.
