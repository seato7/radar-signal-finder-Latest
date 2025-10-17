FROM python:3.11-slim

WORKDIR /app

# Install dependencies and fix OpenSSL security level for MongoDB Atlas
RUN apt-get update && \
    apt-get install -y curl ca-certificates libssl3 && \
    rm -rf /var/lib/apt/lists/*

# Set OpenSSL to use security level 1 for MongoDB Atlas compatibility
ENV OPENSSL_CONF=/etc/ssl/openssl.cnf
RUN echo "openssl_conf = openssl_init\n\
[openssl_init]\n\
ssl_conf = ssl_sect\n\
[ssl_sect]\n\
system_default = system_default_sect\n\
[system_default_sect]\n\
CipherString = DEFAULT@SECLEVEL=1" >> /etc/ssl/openssl.cnf

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./backend

ENV PYTHONPATH=/app

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
