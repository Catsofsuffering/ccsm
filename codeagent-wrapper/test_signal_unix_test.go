//go:build !windows

package main

import (
	"os"
	"syscall"
)

func testTerminateSignal() os.Signal {
	return syscall.SIGTERM
}

func testInterruptSignal() os.Signal {
	return syscall.SIGINT
}

func testResetSignals() []os.Signal {
	return []os.Signal{syscall.SIGINT, syscall.SIGTERM}
}
