FROM harbor.mindreon.com/ops/node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    PIP_NO_CACHE_DIR=1 \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
    PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn

RUN sed -i \
      -e 's#http://deb.debian.org/debian#https://mirrors.tuna.tsinghua.edu.cn/debian#g' \
      -e 's#http://deb.debian.org/debian-security#https://mirrors.tuna.tsinghua.edu.cn/debian-security#g' \
      /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
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
RUN python3 -m pip install --break-system-packages "dvc[s3]" modelscope "huggingface_hub[cli]"

WORKDIR /opt/mindreon-cli

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY README.md npm.md ./
COPY src ./src
COPY skills ./skills

RUN npm install -g . --omit=dev

RUN mkdir -p /workspace && chown -R node:node /opt/mindreon-cli /workspace

USER node
WORKDIR /workspace

CMD ["mindreon", "--help"]
