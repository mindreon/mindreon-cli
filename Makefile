IMAGE_NAME ?= mindreon/mindreon-cli
IMAGE_TAG ?= latest
IMAGE ?= $(IMAGE_NAME):$(IMAGE_TAG)

.PHONY: image-build image-push image-build-push image-run-help

image-build:
	docker build -t $(IMAGE) .

image-push:
	docker push $(IMAGE)

image-build-push: image-build image-push

image-run-help:
	docker run --rm $(IMAGE) mindreon --help
