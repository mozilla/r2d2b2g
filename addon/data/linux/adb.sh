#!/bin/bash
# Yes, this is ridiculous.
# We want to call $1 with all params starting at $3
# and redirect the result in $2
CMD=$1
DEST=$2
shift; shift;
echo $# > /tmp/adb-cmd.txt
echo $CMD $@ >> /tmp/adb-cmd.txt
export ADB_TRACE=1
$CMD $@ > $DEST
exit $?