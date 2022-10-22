#!/bin/env bash

# WARNING: Anything that gets sent to STDOUT from this file gets included in the 
#      final compose file, which usually breaks it. 
#      1>&2: To work around this, you can use 1>&2 to pipe STDOUT to STDERR, which does 
#      not get included in the compose file, but still gets printed. 

# compose.sh defaults $service_name to the service's directory name. It can be overridden here. 
# service_name=

# Leave blank to disable this service by default.
set_service_flag $service_name
#set_service_flag $service_name yes

# Sets the application prefix depending on what $INGRESS_TYPE is set to. 
# Results in one of the following paths: 
# https://some.domain/prefix/
# https://prefix.some.domain/
# prefix=$service_name

# This is how to optionally include additional .yml files. See the prometheus repo 
# for a complete example.
## If the include exporters flag is set
#if [ ! -z "$SERVICE_prometheus_exporters" ]; then
#    export SERVICE_CONFIG_prometheus_exporters=${TECHNOCORE_SERVICES}/prometheus/exporters.yml
#fi

#if [[ "$LIVE_MOUNT_ESPHOME_ENABLED" != "" ]]; then
#    # START HERE: I think these might need
#    export ESPHOME_VOLUME=${TECHNOCORE_ROOT}/hals/
#else
#    export ESPHOME_VOLUME=esphome
#fi

#generate_mount dev migrations /usr/share/dogfish/shell-migrations

#set_optional_service home-assistant
#set_optional_service influxdb
#set_optional_service mqtt
#set_optional_service pgadmin
#set_optional_service syncthing
set_optional_service prometheus
