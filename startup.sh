#!/bin/bash
while true
do
	xvfb-run node bot.js
	dt=$(date '+%d.%m.%Y %H:%M:%S');
	echo "Restarting HoneyBot at $dt..."
done
