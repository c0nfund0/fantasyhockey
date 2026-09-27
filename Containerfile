FROM docker.io/library/ubuntu:22.04

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
