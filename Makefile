IMAGE_NAME ?= mindreon/mindreon-cli
IMAGE_TAG ?= latest
IMAGE ?= $(IMAGE_NAME):$(IMAGE_TAG)
PLATFORMS ?= linux/amd64,linux/arm64
BUILDER ?= mindreon-cli-builder

.PHONY: buildx-create image-build-local image-push image-build-push image-buildx image-buildx-push image-run-help

buildx-create:
	@if ! docker buildx inspect $(BUILDER) >/dev/null 2>&1; then \
		docker buildx create --name $(BUILDER) --use; \
	else \
		docker buildx use $(BUILDER); \
	fi
	docker buildx inspect --bootstrap >/dev/null

image-build-local:
	docker build -t $(IMAGE) .

image-push:
	docker push $(IMAGE)

image-build-push: image-build-local image-push

image-buildx: buildx-create
	docker buildx build \
		--platform $(PLATFORMS) \
		-t $(IMAGE) \
		--load \
		.

image-buildx-push: buildx-create
	docker buildx build \
		--platform $(PLATFORMS) \
		-t $(IMAGE) \
		--push \
		.

image-run-help:
	docker run --rm $(IMAGE) mindreon --help
