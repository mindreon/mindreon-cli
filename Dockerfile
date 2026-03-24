FROM node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    git \
    git-lfs \
    make \
    openssh-client \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN git lfs install --system
RUN python3 -m pip install --no-cache-dir --break-system-packages "dvc[s3]"

WORKDIR /opt/mindreon-cli

COPY package.json package-lock.json README.md npm.md ./
COPY src ./src
COPY skills ./skills

RUN npm install -g .

RUN mkdir -p /workspace && chown -R node:node /opt/mindreon-cli /workspace

USER node
WORKDIR /workspace

CMD ["mindreon", "--help"]
