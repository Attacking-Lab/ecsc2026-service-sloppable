# Build stage
FROM rust:alpine AS cgi-build
WORKDIR /app
COPY src /app/src
COPY Cargo.toml /app/
COPY Cargo.lock /app/
RUN cargo build --release

# Runtime stage
FROM httpd:alpine

RUN apk add --no-cache bash jq

COPY --from=cgi-build /app/target/release/runtime /usr/local/apache2/cgi-bin/runtime
COPY apache/cgi-bin/check-access /usr/local/apache2/cgi-bin/check-access
RUN chmod +x /usr/local/apache2/cgi-bin/check-access
COPY apache/httpd.conf /usr/local/apache2/conf/httpd.conf

EXPOSE 80

CMD ["httpd-foreground"]
