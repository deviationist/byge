# The API only. Unlike a typical SPA-plus-API image, the PWA is NOT embedded
# here: byge's web build is an Expo/Metro export served as static files, and
# keeping it out means the proxy can be redeployed without rebuilding the app
# and vice versa.
FROM golang:1.26-alpine AS build
WORKDIR /src/api
COPY api/go.mod ./
RUN go mod download
COPY api/ ./
RUN CGO_ENABLED=0 go build -o /app ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /app /app
ENV ADDR=0.0.0.0:8080
EXPOSE 8080
ENTRYPOINT ["/app"]
