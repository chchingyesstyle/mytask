#!/bin/bash
set -e
COMPOSE="docker compose"

case "$1" in
  start)
    $COMPOSE up -d
    echo "MyTask running — open http://$(hostname -I | awk '{print $1}'):8000"
    ;;
  stop)
    $COMPOSE down
    echo "MyTask stopped."
    ;;
  restart)
    $COMPOSE restart
    echo "MyTask restarted."
    ;;
  rebuild)
    $COMPOSE down
    $COMPOSE build --no-cache
    $COMPOSE up -d
    echo "MyTask rebuilt — open http://$(hostname -I | awk '{print $1}'):8000"
    ;;
  status)
    $COMPOSE ps
    ;;
  logs)
    $COMPOSE logs -f
    ;;
  *)
    echo "Usage: ./docker.sh {start|stop|restart|rebuild|status|logs}"
    exit 1
    ;;
esac
