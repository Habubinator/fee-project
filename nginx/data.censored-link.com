server {
    listen 80;
    listen [::]:80;
    server_name data.censored-link.com;

    root /var/www/app/static;
    index landing-b2b.html;

    location / {
        try_files $uri $uri/ /landing-b2b.html;
    }

    gzip on;
    gzip_types text/html text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
