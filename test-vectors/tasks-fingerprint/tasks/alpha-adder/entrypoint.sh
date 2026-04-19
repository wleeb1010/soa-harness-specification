#!/bin/sh
a=$(cat /inputs/a.txt)
b=$(cat /inputs/b.txt)
echo $((a + b)) > /output/result.txt
