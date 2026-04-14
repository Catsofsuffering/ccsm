package main

import "os"

func init() {
	_ = os.Setenv("CODEAGENT_OPEN_BROWSER", "false")
}
