#!/bin/sh
set +x
case "$1" in
  *Username*) printf '%s\n' 'giuliozompi' ;;
  *Password*) printf '%s\n' "$GITHUB_PERSONAL_ACCESS_TOKEN" ;;
  *) exit 1 ;;
esac
