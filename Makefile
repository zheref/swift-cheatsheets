.PHONY: build verify serve serve-https clean all

PORT ?= 8000
HTTPS_PORT ?= 8443

all: build verify

## Regenerate index.html from the content in src/
build:
	python3 src/build.py

## Structural checks on the generated page
verify:
	python3 src/verify.py

## Serve over plain HTTP on the local network
serve: build
	./serve.command $(PORT)

## Serve over HTTPS (self-signed) for browsers that force TLS
serve-https: build
	./serve-https.command $(HTTPS_PORT)

## Remove generated artefacts
clean:
	rm -f index.html
	rm -rf .localcert src/__pycache__
