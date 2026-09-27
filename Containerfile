FROM docker.io/library/ubuntu:22.04

# Podman/Docker auto-populate these build ARGs from the calling process's own
# HTTP_PROXY/HTTPS_PROXY env vars (predefined build args) - no --build-arg
# needed. apt itself does NOT read them the way curl/git do though, so it
# still needs its own explicit config - same fix already applied to the real
# instances via ansible's "Configure apt to use the Squid proxy" task (and to
# claude-api's Containerfile, which hit this exact same failure first).
ARG HTTP_PROXY
ARG HTTPS_PROXY
RUN if [ -n "$HTTP_PROXY" ]; then \
      { echo "Acquire::http::Proxy \"$HTTP_PROXY\";"; echo "Acquire::https::Proxy \"$HTTPS_PROXY\";"; } \
        > /etc/apt/apt.conf.d/95proxy; \
    fi

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      python3 && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash --uid 1000 apiuser
WORKDIR /app
COPY index.html ./
COPY css/ css/
COPY js/ js/
COPY data/ data/
RUN chown -R apiuser:apiuser /app
USER apiuser

CMD python3 -m http.server "$PORT" --bind 0.0.0.0 --directory /app
