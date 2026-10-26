FROM ubuntu:resolute-20260927
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
  apt-get install -y python3 python3-pip git && \
  rm -rf /var/lib/repro-sources-list.sh /var/log/* /var/cache/ldconfig/aux-cache

WORKDIR /tmp

RUN python3 -m pip install --break-system-packages uv

WORKDIR /checker

RUN --mount=type=cache,target=/root/.cache/uv \
  --mount=type=bind,source=src/uv.lock,target=uv.lock \
  --mount=type=bind,source=src/pyproject.toml,target=pyproject.toml \
  uv sync --exact --frozen --compile-bytecode --no-install-project

COPY ./src/ /checker/

ENTRYPOINT [ "uv", "run", "--no-sync", "gunicorn", "-c", "gunicorn.conf.py", "checker:app" ]
