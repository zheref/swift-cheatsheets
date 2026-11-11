.PHONY: install build verify test check serve serve-https develop clean all

PORT ?= 8000
HTTPS_PORT ?= 8443

all: build verify

## Install the pinned dependencies (Node 22.22+ or 24)
install:
	npm ci

## Build the Gatsby site (public/) and the offline file (index.html)
build:
	npm run build

## Structural checks on both built outputs
verify:
	npm run verify

## Unit, parity, rendering and hydration tests
test:
	npm test

## Everything CI runs: typecheck, tests, build, verify
check:
	npm run check

## Serve the built site over plain HTTP on the local network
serve: build
	./serve.command $(PORT)

## Serve over HTTPS (self-signed) for browsers that force TLS
serve-https: build
	./serve-https.command $(HTTPS_PORT)

## Live-reloading development server on http://localhost:8000
develop:
	npm run develop

## Remove generated artefacts (the committed index.html is kept)
clean:
	npm run clean
	rm -rf .localcert coverage
