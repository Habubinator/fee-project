server {
    listen 80;
    listen [::]:80;
    server_name app.censored-link.com www.app.censored-link.com;

    root /var/www/app/static;
    index landing-b2c.html;

    location / {
        try_files $uri $uri.html $uri/ /landing-b2c.html;
    }

    gzip on;
    gzip_types text/html text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
