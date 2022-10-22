#!/usr/bin/env bash

# TODO: Add some kind of validation.
service_name=$1
SERVICE_NAME=${1^^}

find . -type f | grep -v "/\.git/" | grep -v "replace_example_service" | xargs sed -i "s/example_service/$service_name/g"
find . -type f | grep -v "/\.git/" | grep -v "replace_example_service" | xargs sed -i "s/EXAMPLE_SERVICE/$SERVICE_NAME/g"
