FROM ubuntu:22.04

WORKDIR /app

# Install Python 3.11 and dependencies
RUN apt-get update && \
    apt-get install -y software-properties-common && \
    add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y \
        python3.11 \
        python3.11-dev \
        python3-pip \
        curl \
        ca-certificates && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 && \
    rm -rf /var/lib/apt/lists/*

# Modify system OpenSSL config to use SECLEVEL=1 for MongoDB Atlas
RUN sed -i 's/SECLEVEL=2/SECLEVEL=1/g' /etc/ssl/openssl.cnf || echo "CipherString = DEFAULT@SECLEVEL=1" >> /etc/ssl/openssl.cnf

COPY requirements.txt ./requirements.txt
RUN python3 -m pip install --no-cache-dir -r requirements.txt

COPY . ./backend

ENV PYTHONPATH=/app

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
