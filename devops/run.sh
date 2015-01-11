#!/bin/bash

docker run --restart always --name localtunnel -d --net host defunctzombie/localtunnel-server:0.0.5 bin/server --secure --port 2000 --max-sockets 5

docker run --restart always --name nginx -d --net host -v /home/core/nginx/nginx.conf:/etc/nginx/nginx.conf -v /home/core/nginx/sites:/etc/nginx/sites -v /home/core/nginx/ssl:/etc/nginx/ssl nginx:1.7.8
