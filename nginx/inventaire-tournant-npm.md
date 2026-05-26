# Configuration Nginx Proxy Manager — Inventaire Tournant

Tous les conteneurs sont sur le réseau Docker `proxy`.
NPM les atteint directement par nom de conteneur, sans port localhost.

## Proxy Host 1 — Interface Tablette

| Champ | Valeur |
|-------|--------|
| Domain Names | `tablette.votre-domaine.com` |
| Scheme | `http` |
| Forward Hostname | `inventaires_tournants_frontend-tablette_1` |
| Forward Port | `80` |
| Websockets | activé |

**Custom Nginx config (onglet Advanced) :**
```nginx
location /api/ {
    proxy_pass http://inventaires_tournants_backend_1:3004;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}

location /health {
    proxy_pass http://inventaires_tournants_backend_1:3004/health;
}
```

## Proxy Host 2 — Interface Admin

| Champ | Valeur |
|-------|--------|
| Domain Names | `admin.votre-domaine.com` |
| Scheme | `http` |
| Forward Hostname | `inventaires_tournants_frontend-admin_1` |
| Forward Port | `80` |
| Websockets | activé |

**Custom Nginx config (onglet Advanced) :**
```nginx
location /api/ {
    proxy_pass http://inventaires_tournants_backend_1:3004;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}

location /health {
    proxy_pass http://inventaires_tournants_backend_1:3004/health;
}
```

## SSL

Dans chaque Proxy Host → onglet SSL → demander un certificat Let's Encrypt.
