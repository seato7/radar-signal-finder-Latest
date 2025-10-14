# Production Deployment Guide

This guide covers deploying Opportunity Radar to production with security, automation, and observability best practices.

## Architecture Overview

```mermaid
graph LR
    A[Users] -->|HTTPS| B[Reverse Proxy]
    B --> C[Frontend Static]
    B -->|/api/*| D[Backend API]
    D --> E[(MongoDB)]
    F[Cron/Scheduler] -->|Hourly| D
    D -->|Alerts| G[Slack]
```

## Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    volumes:
      - mongo_data_prod:/data/db
    networks:
      - backend
    # No ports exposed publicly

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      MONGO_URL: mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongo:27017
      DB_NAME: opportunity_radar_prod
      FRONTEND_PUBLIC_URL: https://yourdomain.com
      LOG_LEVEL: INFO
      # All other env vars from .env.prod
    env_file:
      - .env.prod
    depends_on:
      - mongo
    networks:
      - backend
    # No direct port exposure

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
      args:
        VITE_API_URL: https://yourdomain.com
    restart: unless-stopped
    networks:
      - frontend
    # No direct port exposure

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - frontend_static:/usr/share/nginx/html:ro
    depends_on:
      - frontend
      - backend
    networks:
      - frontend
      - backend

networks:
  frontend:
  backend:

volumes:
  mongo_data_prod:
  frontend_static:
```

## Reverse Proxy Configuration

### Nginx (`nginx.conf`)

```nginx
user nginx;
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log warn;

    # Performance
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    # HTTP -> HTTPS redirect
    server {
        listen 80;
        server_name yourdomain.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name yourdomain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # Frontend (static)
        location / {
            root /usr/share/nginx/html;
            try_files $uri $uri/ /index.html;
        }

        # API proxy
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://backend:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Health check
        location /health {
            access_log off;
            proxy_pass http://backend:8000/api/healthz;
        }
    }
}
```

### Caddy Alternative (`Caddyfile`)

```caddyfile
yourdomain.com {
    # Automatic HTTPS with Let's Encrypt
    
    # Frontend
    root * /usr/share/caddy
    file_server
    try_files {path} /index.html

    # API
    handle_path /api/* {
        reverse_proxy backend:8000 {
            lb_policy round_robin
            health_uri /api/healthz
            health_interval 30s
        }
    }

    # Rate limiting
    rate_limit {
        zone api {
            key {remote_host}
            events 100
            window 1m
        }
    }

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        X-XSS-Protection "1; mode=block"
        Strict-Transport-Security "max-age=31536000;"
    }

    # Logging
    log {
        output file /var/log/caddy/access.log
        format json
    }
}
```

## Automated ETL Ingestion

### Cron (Linux)

Add to `/etc/cron.d/opportunity-radar`:

```cron
# Run real-mode ingest hourly at :05
5 * * * * curl -X POST https://yourdomain.com/api/ingest/run?mode=real -H "Authorization: Bearer ${INGEST_TOKEN}"

# Check and fire alerts every 30 minutes
*/30 * * * * curl -X POST https://yourdomain.com/api/alerts/check -H "Authorization: Bearer ${ALERT_TOKEN}"
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: opportunity-radar-ingest
spec:
  schedule: "5 * * * *"  # Hourly at :05
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: ingest
            image: curlimages/curl:latest
            args:
            - sh
            - -c
            - |
              curl -X POST https://yourdomain.com/api/ingest/run?mode=real \
                -H "Authorization: Bearer $INGEST_TOKEN"
          restartPolicy: OnFailure
          env:
          - name: INGEST_TOKEN
            valueFrom:
              secretKeyRef:
                name: opportunity-radar-secrets
                key: ingest-token
```

### Cloud Scheduler (GCP)

```bash
gcloud scheduler jobs create http opportunity-radar-ingest \
  --schedule="5 * * * *" \
  --uri="https://yourdomain.com/api/ingest/run?mode=real" \
  --http-method=POST \
  --headers="Authorization=Bearer ${INGEST_TOKEN}"
```

## Security Checklist

### MongoDB
- [ ] Create dedicated user with least-privilege permissions
  ```javascript
  use opportunity_radar_prod
  db.createUser({
    user: "radar_app",
    pwd: "strong-password",
    roles: [
      { role: "readWrite", db: "opportunity_radar_prod" }
    ]
  })
  ```
- [ ] Enable authentication in `mongod.conf`
- [ ] Restrict network access (no public exposure)
- [ ] Regular backups with `mongodump`

### API
- [ ] Use environment variables for secrets (never hardcode)
- [ ] Implement API key authentication for ingest endpoints
- [ ] Enable HTTPS only (enforce with HSTS headers)
- [ ] Rate limit all public endpoints
- [ ] Log all ingest and alert actions
- [ ] Set CORS to production domain only

### TLS/SSL
- [ ] Obtain certificate (Let's Encrypt for free)
- [ ] Configure strong TLS protocols (1.2+)
- [ ] Enable HTTP/2
- [ ] Set proper cipher suites

## Monitoring & Observability

### Health Endpoints

```bash
# MongoDB connection
curl https://yourdomain.com/api/healthz

# Index status
curl https://yourdomain.com/api/healthz/indexes
```

### Metrics to Track
- ETL run success rate (target: >95%)
- Alert firing frequency
- API response times (p50, p95, p99)
- Database query performance
- Signal ingestion rate

### Logging
- Use structured JSON logging in production
- Ship logs to centralized system (ELK, Datadog, CloudWatch)
- Set retention policy (e.g., 30 days)

### Alerting
Configure alerts for:
- ETL failures (>2 consecutive)
- API error rate >5%
- Database connection failures
- Disk space <20%

## Backup & Recovery

### MongoDB Backup
```bash
# Daily backup cron
0 2 * * * mongodump --uri="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/opportunity_radar_prod" --out=/backups/$(date +\%Y\%m\%d)

# Rotate backups (keep 7 days)
0 3 * * * find /backups -type d -mtime +7 -exec rm -rf {} +
```

### Restore
```bash
mongorestore --uri="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/opportunity_radar_prod" /backups/20240115
```

## Scaling Considerations

### Horizontal Scaling (Backend)
Add load balancer and multiple backend replicas:
```yaml
backend:
  deploy:
    replicas: 3
    update_config:
      parallelism: 1
      delay: 10s
```

### Database Replication
Consider MongoDB replica set for high availability:
```yaml
mongo:
  command: --replSet rs0
```

### Caching
Add Redis for frequently accessed data:
- Theme scores (5-minute TTL)
- Recent signals (1-hour TTL)
- Alert thresholds (static cache)

## Cost Optimization

1. **Right-size resources:** Start small, scale based on actual usage
2. **Use spot/preemptible instances:** For non-critical workloads
3. **Implement signal TTL:** Keep only last 1 year (configurable via `TTL_DAYS`)
4. **Compress old data:** Archive to cold storage after 6 months
5. **Optimize queries:** Use indexes, limit result sets

## 10-Minute Production Deploy Checklist

- [ ] 1. Clone repo and copy `.env.example` to `.env.prod`
- [ ] 2. Configure all environment variables (MongoDB credentials, domain, Slack webhook)
- [ ] 3. Obtain TLS certificate (certbot or cloud provider)
- [ ] 4. Update `nginx.conf` with your domain
- [ ] 5. Run `docker-compose -f docker-compose.prod.yml up -d`
- [ ] 6. Seed data: `docker-compose exec backend python backend/scripts/seed_themes.py`
- [ ] 7. Set up cron for hourly ingestion
- [ ] 8. Test health endpoints: `curl https://yourdomain.com/health`
- [ ] 9. Configure monitoring/alerting
- [ ] 10. Review logs for first 24 hours

## Support & Resources

- **Documentation:** README.md, EXPORT.md
- **Issues:** [GitHub Issues](https://github.com/your-repo/issues)
- **Community:** [Discord/Slack](#)
- **Security:** Report to security@yourdomain.com
